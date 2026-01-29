// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

/**
 * Parsed skill from a SKILL.md file
 */
export interface LoadedSkill {
    /** Skill name from frontmatter */
    name: string;
    /** Skill description from frontmatter */
    description: string;
    /** Full markdown body (after frontmatter) */
    body: string;
    /** Source file path */
    sourcePath: string;
    /** Whether this is a global or project skill */
    scope: 'project' | 'global';
    /** Optional metadata from frontmatter */
    metadata?: Record<string, unknown>;
}

/**
 * Skill Loader Service
 *
 * Discovers and loads SKILL.md files from OpenClaude skill directories:
 * - Project: .openclaude/skills/ (relative to workspace root)
 * - Global: ~/.openclaude/skills/
 *
 * Also scans standard agent skill paths for cross-agent compatibility:
 * - .agents/skills/
 * - .claude/skills/
 *
 * Parses YAML frontmatter to extract name, description, and metadata.
 * Makes skill content available to the AI context pipeline.
 */
@injectable()
export class SkillLoaderService implements BackendApplicationContribution {

    protected skills: LoadedSkill[] = [];
    protected workspaceRoot: string = process.cwd();

    initialize(): void {
        this.loadAllSkills();
        console.log(`[OpenClaude] Skill loader initialized: ${this.skills.length} skills loaded`);
    }

    /**
     * Get all loaded skills
     */
    getSkills(): LoadedSkill[] {
        return this.skills;
    }

    /**
     * Get a skill by name
     */
    getSkill(name: string): LoadedSkill | undefined {
        return this.skills.find(s => s.name === name);
    }

    /**
     * Reload all skills from disk
     */
    reload(): void {
        this.skills = [];
        this.loadAllSkills();
        console.log(`[OpenClaude] Skills reloaded: ${this.skills.length} skills`);
    }

    /**
     * Set the workspace root for project-level skill discovery
     */
    setWorkspaceRoot(root: string): void {
        this.workspaceRoot = root;
        this.reload();
    }

    /**
     * Get all skill content concatenated as context for AI prompts
     */
    getSkillContext(): string {
        if (this.skills.length === 0) {
            return '';
        }

        const sections = this.skills.map(skill =>
            `## Skill: ${skill.name}\n\n${skill.description}\n\n${skill.body}`
        );

        return `# Loaded Skills (${this.skills.length})\n\n${sections.join('\n\n---\n\n')}`;
    }

    /**
     * Load skills from all known directories
     */
    protected loadAllSkills(): void {
        const home = homedir();
        const seenNames = new Set<string>();

        // Priority order: project-specific first, then global
        const searchDirs: Array<{ dir: string; scope: 'project' | 'global' }> = [
            // OpenClaude-specific paths (project)
            { dir: path.join(this.workspaceRoot, '.openclaude', 'skills'), scope: 'project' },
            // Cross-agent canonical path (project)
            { dir: path.join(this.workspaceRoot, '.agents', 'skills'), scope: 'project' },
            // Claude Code path (project) — for backward compatibility
            { dir: path.join(this.workspaceRoot, '.claude', 'skills'), scope: 'project' },
            // Standard skills/ directory (project)
            { dir: path.join(this.workspaceRoot, 'skills'), scope: 'project' },

            // OpenClaude-specific paths (global)
            { dir: path.join(home, '.openclaude', 'skills'), scope: 'global' },
            // Cross-agent canonical path (global)
            { dir: path.join(home, '.agents', 'skills'), scope: 'global' },
            // Claude Code path (global)
            { dir: path.join(home, '.claude', 'skills'), scope: 'global' },
        ];

        for (const { dir, scope } of searchDirs) {
            const skills = this.loadSkillsFromDirectory(dir, scope);
            for (const skill of skills) {
                // Deduplicate by name — first found wins (project over global)
                if (!seenNames.has(skill.name)) {
                    seenNames.add(skill.name);
                    this.skills.push(skill);
                }
            }
        }
    }

    /**
     * Load all skills from a single directory
     */
    protected loadSkillsFromDirectory(dir: string, scope: 'project' | 'global'): LoadedSkill[] {
        const results: LoadedSkill[] = [];

        if (!fs.existsSync(dir)) {
            return results;
        }

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const skillMdPath = path.join(dir, entry.name, 'SKILL.md');
                    if (fs.existsSync(skillMdPath)) {
                        const skill = this.parseSkillMd(skillMdPath, scope);
                        if (skill) {
                            results.push(skill);
                        }
                    }
                } else if (entry.name === 'SKILL.md') {
                    // Root SKILL.md in the directory itself
                    const skill = this.parseSkillMd(path.join(dir, entry.name), scope);
                    if (skill) {
                        results.push(skill);
                    }
                }
            }
        } catch (error) {
            console.warn(`[OpenClaude] Failed to read skills directory ${dir}:`, error);
        }

        return results;
    }

    /**
     * Parse a SKILL.md file with YAML frontmatter
     *
     * Expected format:
     * ---
     * name: skill-name
     * description: What this skill does
     * metadata:
     *   key: value
     * ---
     *
     * # Markdown body here
     */
    protected parseSkillMd(filePath: string, scope: 'project' | 'global'): LoadedSkill | undefined {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');

            // Parse YAML frontmatter
            const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
            if (!frontmatterMatch) {
                console.warn(`[OpenClaude] No frontmatter found in ${filePath}`);
                return undefined;
            }

            const frontmatterRaw = frontmatterMatch[1];
            const body = frontmatterMatch[2].trim();

            // Simple YAML parser for frontmatter (handles name, description, metadata)
            const frontmatter = this.parseSimpleYaml(frontmatterRaw);

            const name = frontmatter.name;
            const description = frontmatter.description;

            if (!name || !description) {
                console.warn(`[OpenClaude] Missing name or description in ${filePath}`);
                return undefined;
            }

            // Check for internal skills
            if (frontmatter.metadata?.internal === true || frontmatter.metadata?.internal === 'true') {
                if (!process.env.INSTALL_INTERNAL_SKILLS) {
                    return undefined;
                }
            }

            return {
                name,
                description,
                body,
                sourcePath: filePath,
                scope,
                metadata: frontmatter.metadata
            };
        } catch (error) {
            console.warn(`[OpenClaude] Failed to parse ${filePath}:`, error);
            return undefined;
        }
    }

    /**
     * Simple YAML parser for skill frontmatter
     * Handles flat key-value pairs and one level of nesting
     */
    protected parseSimpleYaml(yaml: string): Record<string, any> {
        const result: Record<string, any> = {};
        const lines = yaml.split('\n');
        let currentKey: string | undefined;
        let currentIndent = 0;

        for (const line of lines) {
            // Skip empty lines and comments
            if (!line.trim() || line.trim().startsWith('#')) {
                continue;
            }

            const indent = line.length - line.trimStart().length;
            const trimmed = line.trim();
            const colonIndex = trimmed.indexOf(':');

            if (colonIndex === -1) {
                continue;
            }

            const key = trimmed.substring(0, colonIndex).trim();
            const value = trimmed.substring(colonIndex + 1).trim();

            if (indent === 0) {
                // Top-level key
                if (value) {
                    // Remove surrounding quotes if present
                    result[key] = value.replace(/^["']|["']$/g, '');
                } else {
                    // Nested object starts
                    result[key] = {};
                    currentKey = key;
                    currentIndent = indent;
                }
            } else if (currentKey && indent > currentIndent) {
                // Nested key
                if (typeof result[currentKey] === 'object') {
                    let parsedValue: any = value.replace(/^["']|["']$/g, '');
                    if (parsedValue === 'true') {
                        parsedValue = true;
                    } else if (parsedValue === 'false') {
                        parsedValue = false;
                    } else if (!isNaN(Number(parsedValue)) && parsedValue !== '') {
                        parsedValue = Number(parsedValue);
                    }
                    result[currentKey][key] = parsedValue;
                }
            }
        }

        return result;
    }
}
