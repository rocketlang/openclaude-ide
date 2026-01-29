// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under the
// MIT License. See LICENSE file in the project root.
// *****************************************************************************

import * as chai from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SkillLoaderService, LoadedSkill } from './skill-loader-service';

const expect = chai.expect;

before(() => {
    chai.config.showDiff = true;
    chai.config.includeStack = true;
});

/**
 * Testable subclass that exposes protected methods for unit testing.
 * Also disables @postConstruct auto-loading so we control when skills load.
 */
class TestableSkillLoader extends SkillLoaderService {

    // Expose protected methods for testing
    public testParseSimpleYaml(yaml: string): Record<string, any> {
        return this.parseSimpleYaml(yaml);
    }

    public testParseSkillMd(filePath: string, scope: 'project' | 'global'): LoadedSkill | undefined {
        return this.parseSkillMd(filePath, scope);
    }

    public testLoadSkillsFromDirectory(dir: string, scope: 'project' | 'global'): LoadedSkill[] {
        return this.loadSkillsFromDirectory(dir, scope);
    }

    // Override init to prevent auto-loading during tests
    protected override init(): void {
        // no-op: we call loadAllSkills manually in tests
    }

    // Allow setting skills directly for getSkillContext tests
    public setSkillsForTest(skills: LoadedSkill[]): void {
        this.skills = skills;
    }

    // Allow calling loadAllSkills manually
    public triggerLoad(): void {
        this.loadAllSkills();
    }

    // Allow setting workspace root without triggering reload
    public setRoot(root: string): void {
        this.workspaceRoot = root;
    }
}

describe('SkillLoaderService', () => {

    let loader: TestableSkillLoader;
    let tmpDir: string;

    beforeEach(() => {
        loader = new TestableSkillLoader();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-loader-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // =========================================================================
    // parseSimpleYaml
    // =========================================================================

    describe('parseSimpleYaml', () => {

        it('should parse simple key-value pairs', () => {
            const yaml = 'name: my-skill\ndescription: A test skill';
            const result = loader.testParseSimpleYaml(yaml);
            expect(result.name).to.equal('my-skill');
            expect(result.description).to.equal('A test skill');
        });

        it('should strip surrounding quotes from values', () => {
            const yaml = 'name: "quoted-skill"\ndescription: \'single quoted\'';
            const result = loader.testParseSimpleYaml(yaml);
            expect(result.name).to.equal('quoted-skill');
            expect(result.description).to.equal('single quoted');
        });

        it('should parse nested objects', () => {
            const yaml = 'name: test\nmetadata:\n  internal: true\n  version: 2';
            const result = loader.testParseSimpleYaml(yaml);
            expect(result.name).to.equal('test');
            expect(result.metadata).to.deep.equal({ internal: true, version: 2 });
        });

        it('should convert boolean strings to booleans', () => {
            const yaml = 'metadata:\n  enabled: true\n  disabled: false';
            const result = loader.testParseSimpleYaml(yaml);
            expect(result.metadata.enabled).to.equal(true);
            expect(result.metadata.disabled).to.equal(false);
        });

        it('should convert numeric strings to numbers', () => {
            const yaml = 'metadata:\n  count: 42\n  ratio: 3.14';
            const result = loader.testParseSimpleYaml(yaml);
            expect(result.metadata.count).to.equal(42);
            expect(result.metadata.ratio).to.equal(3.14);
        });

        it('should skip empty lines and comments', () => {
            const yaml = '# This is a comment\nname: test\n\n# Another comment\ndescription: works';
            const result = loader.testParseSimpleYaml(yaml);
            expect(result.name).to.equal('test');
            expect(result.description).to.equal('works');
        });

        it('should skip lines without colons', () => {
            const yaml = 'name: test\ngarbage line\ndescription: works';
            const result = loader.testParseSimpleYaml(yaml);
            expect(result.name).to.equal('test');
            expect(result.description).to.equal('works');
        });

        it('should handle empty input', () => {
            const result = loader.testParseSimpleYaml('');
            expect(result).to.deep.equal({});
        });

        it('should handle values containing colons', () => {
            const yaml = 'description: Use this skill when: creating widgets';
            const result = loader.testParseSimpleYaml(yaml);
            expect(result.description).to.equal('Use this skill when: creating widgets');
        });
    });

    // =========================================================================
    // parseSkillMd (with real temp files)
    // =========================================================================

    describe('parseSkillMd', () => {

        it('should parse a valid SKILL.md file', () => {
            const content = '---\nname: test-skill\ndescription: A test skill\n---\n\n# Test Skill\n\nThis is the body.';
            const filePath = path.join(tmpDir, 'SKILL.md');
            fs.writeFileSync(filePath, content);

            const skill = loader.testParseSkillMd(filePath, 'project');
            expect(skill).to.not.be.undefined;
            expect(skill!.name).to.equal('test-skill');
            expect(skill!.description).to.equal('A test skill');
            expect(skill!.body).to.equal('# Test Skill\n\nThis is the body.');
            expect(skill!.scope).to.equal('project');
            expect(skill!.sourcePath).to.equal(filePath);
        });

        it('should return undefined for files without frontmatter', () => {
            const content = '# No Frontmatter\n\nJust markdown.';
            const filePath = path.join(tmpDir, 'SKILL.md');
            fs.writeFileSync(filePath, content);

            const skill = loader.testParseSkillMd(filePath, 'project');
            expect(skill).to.be.undefined;
        });

        it('should return undefined when name is missing', () => {
            const content = '---\ndescription: No name here\n---\n\nBody text.';
            const filePath = path.join(tmpDir, 'SKILL.md');
            fs.writeFileSync(filePath, content);

            const skill = loader.testParseSkillMd(filePath, 'project');
            expect(skill).to.be.undefined;
        });

        it('should return undefined when description is missing', () => {
            const content = '---\nname: no-desc\n---\n\nBody text.';
            const filePath = path.join(tmpDir, 'SKILL.md');
            fs.writeFileSync(filePath, content);

            const skill = loader.testParseSkillMd(filePath, 'project');
            expect(skill).to.be.undefined;
        });

        it('should parse metadata from frontmatter', () => {
            const content = '---\nname: meta-skill\ndescription: Has metadata\nmetadata:\n  internal: false\n  priority: 5\n---\n\nBody.';
            const filePath = path.join(tmpDir, 'SKILL.md');
            fs.writeFileSync(filePath, content);

            const skill = loader.testParseSkillMd(filePath, 'global');
            expect(skill).to.not.be.undefined;
            expect(skill!.scope).to.equal('global');
            expect(skill!.metadata).to.deep.equal({ internal: false, priority: 5 });
        });

        it('should skip internal skills when env var is not set', () => {
            const content = '---\nname: internal-skill\ndescription: Internal only\nmetadata:\n  internal: true\n---\n\nBody.';
            const filePath = path.join(tmpDir, 'SKILL.md');
            fs.writeFileSync(filePath, content);

            // Ensure env var is not set
            delete process.env.INSTALL_INTERNAL_SKILLS;

            const skill = loader.testParseSkillMd(filePath, 'project');
            expect(skill).to.be.undefined;
        });

        it('should return undefined for non-existent file', () => {
            const skill = loader.testParseSkillMd('/nonexistent/SKILL.md', 'project');
            expect(skill).to.be.undefined;
        });
    });

    // =========================================================================
    // loadSkillsFromDirectory (with real temp directories)
    // =========================================================================

    describe('loadSkillsFromDirectory', () => {

        it('should return empty array for non-existent directory', () => {
            const skills = loader.testLoadSkillsFromDirectory('/nonexistent/dir', 'project');
            expect(skills).to.deep.equal([]);
        });

        it('should load skills from subdirectories', () => {
            // Create skill-a/SKILL.md
            const skillADir = path.join(tmpDir, 'skill-a');
            fs.mkdirSync(skillADir);
            fs.writeFileSync(path.join(skillADir, 'SKILL.md'),
                '---\nname: skill-a\ndescription: First skill\n---\n\n# Skill A');

            // Create skill-b/SKILL.md
            const skillBDir = path.join(tmpDir, 'skill-b');
            fs.mkdirSync(skillBDir);
            fs.writeFileSync(path.join(skillBDir, 'SKILL.md'),
                '---\nname: skill-b\ndescription: Second skill\n---\n\n# Skill B');

            const skills = loader.testLoadSkillsFromDirectory(tmpDir, 'project');
            expect(skills).to.have.length(2);

            const names = skills.map(s => s.name).sort();
            expect(names).to.deep.equal(['skill-a', 'skill-b']);
        });

        it('should load a root SKILL.md in the directory itself', () => {
            fs.writeFileSync(path.join(tmpDir, 'SKILL.md'),
                '---\nname: root-skill\ndescription: Root level\n---\n\nRoot body.');

            const skills = loader.testLoadSkillsFromDirectory(tmpDir, 'global');
            expect(skills).to.have.length(1);
            expect(skills[0].name).to.equal('root-skill');
            expect(skills[0].scope).to.equal('global');
        });

        it('should skip subdirectories without SKILL.md', () => {
            const emptyDir = path.join(tmpDir, 'no-skill');
            fs.mkdirSync(emptyDir);
            fs.writeFileSync(path.join(emptyDir, 'README.md'), '# Not a skill');

            const skills = loader.testLoadSkillsFromDirectory(tmpDir, 'project');
            expect(skills).to.deep.equal([]);
        });
    });

    // =========================================================================
    // getSkillContext
    // =========================================================================

    describe('getSkillContext', () => {

        it('should return empty string when no skills loaded', () => {
            loader.setSkillsForTest([]);
            expect(loader.getSkillContext()).to.equal('');
        });

        it('should format a single skill as context', () => {
            loader.setSkillsForTest([{
                name: 'test',
                description: 'A test skill',
                body: '# Instructions\n\nDo the thing.',
                sourcePath: '/fake/path',
                scope: 'project'
            }]);

            const context = loader.getSkillContext();
            expect(context).to.include('# Loaded Skills (1)');
            expect(context).to.include('## Skill: test');
            expect(context).to.include('A test skill');
            expect(context).to.include('# Instructions');
        });

        it('should separate multiple skills with dividers', () => {
            loader.setSkillsForTest([
                { name: 'a', description: 'First', body: 'Body A', sourcePath: '/a', scope: 'project' },
                { name: 'b', description: 'Second', body: 'Body B', sourcePath: '/b', scope: 'global' },
            ]);

            const context = loader.getSkillContext();
            expect(context).to.include('# Loaded Skills (2)');
            expect(context).to.include('---');
            expect(context).to.include('## Skill: a');
            expect(context).to.include('## Skill: b');
        });
    });

    // =========================================================================
    // getSkills / getSkill
    // =========================================================================

    describe('getSkills and getSkill', () => {

        it('should return all loaded skills', () => {
            const skills: LoadedSkill[] = [
                { name: 'x', description: 'd', body: 'b', sourcePath: '/x', scope: 'project' },
            ];
            loader.setSkillsForTest(skills);
            expect(loader.getSkills()).to.deep.equal(skills);
        });

        it('should find a skill by name', () => {
            loader.setSkillsForTest([
                { name: 'alpha', description: 'A', body: 'A', sourcePath: '/a', scope: 'project' },
                { name: 'beta', description: 'B', body: 'B', sourcePath: '/b', scope: 'global' },
            ]);
            const found = loader.getSkill('beta');
            expect(found).to.not.be.undefined;
            expect(found!.name).to.equal('beta');
        });

        it('should return undefined for unknown skill name', () => {
            loader.setSkillsForTest([]);
            expect(loader.getSkill('nonexistent')).to.be.undefined;
        });
    });

    // =========================================================================
    // Full integration: loadAllSkills with deduplication
    // =========================================================================

    describe('loadAllSkills (deduplication)', () => {

        it('should deduplicate skills by name, first found wins', () => {
            // Create two directories with the same skill name
            const dir1 = path.join(tmpDir, '.openclaude', 'skills', 'my-skill');
            const dir2 = path.join(tmpDir, '.agents', 'skills', 'my-skill');

            fs.mkdirSync(dir1, { recursive: true });
            fs.mkdirSync(dir2, { recursive: true });

            fs.writeFileSync(path.join(dir1, 'SKILL.md'),
                '---\nname: my-skill\ndescription: From openclaude dir\n---\n\nFirst version.');
            fs.writeFileSync(path.join(dir2, 'SKILL.md'),
                '---\nname: my-skill\ndescription: From agents dir\n---\n\nSecond version.');

            loader.setRoot(tmpDir);
            loader.triggerLoad();

            const skills = loader.getSkills();
            const mySkill = skills.find(s => s.name === 'my-skill');
            expect(mySkill).to.not.be.undefined;
            // .openclaude/skills/ is scanned first, so it should win
            expect(mySkill!.description).to.equal('From openclaude dir');
        });

        it('should load skills from the skills/ directory', () => {
            const skillDir = path.join(tmpDir, 'skills', 'basic-skill');
            fs.mkdirSync(skillDir, { recursive: true });
            fs.writeFileSync(path.join(skillDir, 'SKILL.md'),
                '---\nname: basic\ndescription: Basic skill\n---\n\nBody.');

            loader.setRoot(tmpDir);
            loader.triggerLoad();

            const skills = loader.getSkills();
            expect(skills.some(s => s.name === 'basic')).to.be.true;
        });
    });

    // =========================================================================
    // reload
    // =========================================================================

    describe('reload', () => {

        it('should clear and reload skills', () => {
            // Load with one skill
            const skillDir = path.join(tmpDir, 'skills', 'first');
            fs.mkdirSync(skillDir, { recursive: true });
            fs.writeFileSync(path.join(skillDir, 'SKILL.md'),
                '---\nname: first\ndescription: First\n---\n\nBody.');

            loader.setRoot(tmpDir);
            loader.triggerLoad();
            expect(loader.getSkills()).to.have.length(1);

            // Add another skill on disk
            const secondDir = path.join(tmpDir, 'skills', 'second');
            fs.mkdirSync(secondDir, { recursive: true });
            fs.writeFileSync(path.join(secondDir, 'SKILL.md'),
                '---\nname: second\ndescription: Second\n---\n\nBody.');

            // Before reload, still 1
            expect(loader.getSkills()).to.have.length(1);

            // After reload, should be 2
            loader.reload();
            expect(loader.getSkills()).to.have.length(2);
        });
    });
});
