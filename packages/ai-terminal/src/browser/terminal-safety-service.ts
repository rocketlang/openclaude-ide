// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, Emitter, Event, ILogger, PreferenceService, PreferenceChange } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';

/**
 * Safety mode for terminal command execution
 */
export enum SafetyMode {
    /** Block all dangerous commands */
    SAFE = 'safe',
    /** Require confirmation for dangerous commands */
    CAUTIOUS = 'cautious',
    /** Allow all commands without confirmation */
    UNRESTRICTED = 'unrestricted'
}

/**
 * Risk level of a command
 */
export enum RiskLevel {
    /** Safe command, no concerns */
    SAFE = 'safe',
    /** Low risk, minor concerns */
    LOW = 'low',
    /** Medium risk, could cause data loss */
    MEDIUM = 'medium',
    /** High risk, system-level danger */
    HIGH = 'high',
    /** Critical risk, could destroy system */
    CRITICAL = 'critical'
}

/**
 * Result of a safety check on a command
 */
export interface SafetyCheckResult {
    /** The command that was checked */
    command: string;
    /** Whether the command is safe to execute */
    safe: boolean;
    /** Risk level of the command */
    riskLevel: RiskLevel;
    /** Whether confirmation is required before execution */
    requiresConfirmation: boolean;
    /** Whether the command should be blocked entirely */
    blocked: boolean;
    /** Reason for the safety assessment */
    reason?: string;
    /** Specific patterns that matched */
    matchedPatterns: string[];
    /** Suggested safer alternative, if any */
    suggestion?: string;
}

/**
 * Pattern for detecting dangerous commands
 */
interface DangerousPattern {
    /** Regular expression to match */
    pattern: RegExp;
    /** Risk level if matched */
    riskLevel: RiskLevel;
    /** Human-readable description */
    description: string;
    /** Suggested alternative */
    suggestion?: string;
    /** Whether to block in safe mode */
    blockInSafeMode: boolean;
}

export const TerminalSafetyService = Symbol('TerminalSafetyService');

/**
 * Service for checking terminal commands for safety before execution
 */
export interface TerminalSafetyService extends Disposable {
    /**
     * Check a command for safety
     */
    checkCommand(command: string): SafetyCheckResult;

    /**
     * Get the current safety mode
     */
    getSafetyMode(): SafetyMode;

    /**
     * Set the safety mode
     */
    setSafetyMode(mode: SafetyMode): void;

    /**
     * Add a custom dangerous pattern
     */
    addDangerousPattern(pattern: DangerousPattern): void;

    /**
     * Remove a custom dangerous pattern
     */
    removeDangerousPattern(pattern: RegExp): void;

    /**
     * Event fired when safety mode changes
     */
    readonly onSafetyModeChanged: Event<SafetyMode>;

    /**
     * Check if a command would be allowed in current mode
     */
    isCommandAllowed(command: string): boolean;
}

@injectable()
export class TerminalSafetyServiceImpl implements TerminalSafetyService {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    protected safetyMode: SafetyMode = SafetyMode.CAUTIOUS;
    protected customPatterns: DangerousPattern[] = [];

    protected readonly onSafetyModeChangedEmitter = new Emitter<SafetyMode>();
    readonly onSafetyModeChanged = this.onSafetyModeChangedEmitter.event;

    /**
     * Built-in dangerous command patterns
     */
    protected readonly dangerousPatterns: DangerousPattern[] = [
        // Critical - System destruction
        {
            pattern: /\brm\s+(-[rRf]+\s+)*[\/~]\s*$/,
            riskLevel: RiskLevel.CRITICAL,
            description: 'Recursive delete of root or home directory',
            suggestion: 'Specify a more specific path',
            blockInSafeMode: true
        },
        {
            pattern: /\brm\s+(-[rRf]+\s+)+\*\s*$/,
            riskLevel: RiskLevel.CRITICAL,
            description: 'Recursive delete with wildcard',
            suggestion: 'Use a more specific pattern',
            blockInSafeMode: true
        },
        {
            pattern: /:(){ :|:& };:/,
            riskLevel: RiskLevel.CRITICAL,
            description: 'Fork bomb detected',
            blockInSafeMode: true
        },
        {
            pattern: /\bdd\s+.*\bof=\/dev\/(sd[a-z]|nvme|hd[a-z])/i,
            riskLevel: RiskLevel.CRITICAL,
            description: 'Direct disk write - could destroy data',
            blockInSafeMode: true
        },
        {
            pattern: /\bmkfs\b/,
            riskLevel: RiskLevel.CRITICAL,
            description: 'Filesystem creation - will destroy existing data',
            blockInSafeMode: true
        },
        {
            pattern: />\s*\/dev\/(sd[a-z]|nvme|hd[a-z])/i,
            riskLevel: RiskLevel.CRITICAL,
            description: 'Redirect to disk device',
            blockInSafeMode: true
        },

        // High - System modification
        {
            pattern: /\bchmod\s+(-[rR]+\s+)*777\s+\//,
            riskLevel: RiskLevel.HIGH,
            description: 'Setting world-writable permissions on system paths',
            suggestion: 'Use more restrictive permissions (755 or 644)',
            blockInSafeMode: true
        },
        {
            pattern: /\bchown\s+(-[rR]+\s+)*root/,
            riskLevel: RiskLevel.HIGH,
            description: 'Changing ownership to root',
            blockInSafeMode: true
        },
        {
            pattern: /\bsudo\s+rm\s+-rf/,
            riskLevel: RiskLevel.HIGH,
            description: 'Sudo recursive force delete',
            suggestion: 'Review the path carefully before executing',
            blockInSafeMode: true
        },
        {
            pattern: /\b(systemctl|service)\s+(stop|disable|mask)\s+(docker|nginx|apache|mysql|postgres|sshd)/,
            riskLevel: RiskLevel.HIGH,
            description: 'Stopping critical system service',
            blockInSafeMode: true
        },
        {
            pattern: /\biptables\s+(-[FA]|--flush)/,
            riskLevel: RiskLevel.HIGH,
            description: 'Flushing firewall rules',
            blockInSafeMode: true
        },

        // Medium - Data modification
        {
            pattern: /\brm\s+(-[rRf]+\s+)+/,
            riskLevel: RiskLevel.MEDIUM,
            description: 'Recursive or force delete',
            suggestion: 'Consider using trash-cli instead',
            blockInSafeMode: false
        },
        {
            pattern: /\bgit\s+(reset|checkout)\s+--hard/,
            riskLevel: RiskLevel.MEDIUM,
            description: 'Git hard reset - uncommitted changes will be lost',
            suggestion: 'Stash changes first with git stash',
            blockInSafeMode: false
        },
        {
            pattern: /\bgit\s+push\s+(-f|--force)/,
            riskLevel: RiskLevel.MEDIUM,
            description: 'Force push - could overwrite remote history',
            suggestion: 'Use --force-with-lease instead',
            blockInSafeMode: false
        },
        {
            pattern: /\bgit\s+clean\s+-[fd]+/,
            riskLevel: RiskLevel.MEDIUM,
            description: 'Git clean - will delete untracked files',
            suggestion: 'Run with -n first to preview',
            blockInSafeMode: false
        },
        {
            pattern: /\bDROP\s+(DATABASE|TABLE|SCHEMA)/i,
            riskLevel: RiskLevel.MEDIUM,
            description: 'SQL drop statement',
            blockInSafeMode: false
        },
        {
            pattern: /\bTRUNCATE\s+TABLE/i,
            riskLevel: RiskLevel.MEDIUM,
            description: 'SQL truncate statement',
            blockInSafeMode: false
        },
        {
            pattern: /\bDELETE\s+FROM\s+\w+\s*;?\s*$/i,
            riskLevel: RiskLevel.MEDIUM,
            description: 'SQL delete without WHERE clause',
            suggestion: 'Add a WHERE clause to limit deletion',
            blockInSafeMode: false
        },

        // Low - Caution needed
        {
            pattern: /\bsudo\b/,
            riskLevel: RiskLevel.LOW,
            description: 'Elevated privileges requested',
            blockInSafeMode: false
        },
        {
            pattern: /\bcurl\s+.*\|\s*(sudo\s+)?(ba)?sh/,
            riskLevel: RiskLevel.LOW,
            description: 'Piping curl to shell',
            suggestion: 'Download and inspect script first',
            blockInSafeMode: false
        },
        {
            pattern: /\bwget\s+.*\|\s*(sudo\s+)?(ba)?sh/,
            riskLevel: RiskLevel.LOW,
            description: 'Piping wget to shell',
            suggestion: 'Download and inspect script first',
            blockInSafeMode: false
        },
        {
            pattern: /\beval\s+/,
            riskLevel: RiskLevel.LOW,
            description: 'Eval command - executes arbitrary code',
            blockInSafeMode: false
        },
        {
            pattern: /\bnpm\s+(install|i)\s+--global/,
            riskLevel: RiskLevel.LOW,
            description: 'Global npm install',
            blockInSafeMode: false
        },
        {
            pattern: /\bchmod\s+\+x/,
            riskLevel: RiskLevel.LOW,
            description: 'Making file executable',
            blockInSafeMode: false
        }
    ];

    @postConstruct()
    protected init(): void {
        // Load safety mode from preferences
        const savedMode = this.preferenceService.get<string>('openclaude.terminal.safetyMode');
        if (savedMode && Object.values(SafetyMode).includes(savedMode as SafetyMode)) {
            this.safetyMode = savedMode as SafetyMode;
        }

        // Watch for preference changes
        this.preferenceService.onPreferenceChanged((event: PreferenceChange) => {
            if (event.preferenceName === 'openclaude.terminal.safetyMode') {
                const mode = event.newValue as SafetyMode;
                if (mode && Object.values(SafetyMode).includes(mode)) {
                    this.safetyMode = mode;
                    this.onSafetyModeChangedEmitter.fire(mode);
                }
            }
        });
    }

    dispose(): void {
        this.onSafetyModeChangedEmitter.dispose();
    }

    checkCommand(command: string): SafetyCheckResult {
        const normalizedCommand = command.trim();
        const matchedPatterns: string[] = [];
        let highestRiskLevel = RiskLevel.SAFE;
        let shouldBlock = false;
        let reason: string | undefined;
        let suggestion: string | undefined;

        // Check against all patterns
        const allPatterns = [...this.dangerousPatterns, ...this.customPatterns];

        for (const dangerPattern of allPatterns) {
            if (dangerPattern.pattern.test(normalizedCommand)) {
                matchedPatterns.push(dangerPattern.description);

                // Update highest risk level
                if (this.compareRiskLevels(dangerPattern.riskLevel, highestRiskLevel) > 0) {
                    highestRiskLevel = dangerPattern.riskLevel;
                    reason = dangerPattern.description;
                    suggestion = dangerPattern.suggestion;
                }

                // Check if should block in safe mode
                if (this.safetyMode === SafetyMode.SAFE && dangerPattern.blockInSafeMode) {
                    shouldBlock = true;
                }
            }
        }

        // Determine if confirmation is required
        const requiresConfirmation = this.safetyMode === SafetyMode.CAUTIOUS &&
            highestRiskLevel !== RiskLevel.SAFE;

        return {
            command: normalizedCommand,
            safe: highestRiskLevel === RiskLevel.SAFE,
            riskLevel: highestRiskLevel,
            requiresConfirmation,
            blocked: shouldBlock,
            reason,
            matchedPatterns,
            suggestion
        };
    }

    getSafetyMode(): SafetyMode {
        return this.safetyMode;
    }

    setSafetyMode(mode: SafetyMode): void {
        if (this.safetyMode !== mode) {
            this.safetyMode = mode;
            this.preferenceService.set('openclaude.terminal.safetyMode', mode);
            this.onSafetyModeChangedEmitter.fire(mode);
            this.logger.info(`Terminal safety mode changed to: ${mode}`);
        }
    }

    addDangerousPattern(pattern: DangerousPattern): void {
        this.customPatterns.push(pattern);
        this.logger.info(`Added custom dangerous pattern: ${pattern.description}`);
    }

    removeDangerousPattern(pattern: RegExp): void {
        const index = this.customPatterns.findIndex(p => p.pattern.source === pattern.source);
        if (index !== -1) {
            const removed = this.customPatterns.splice(index, 1)[0];
            this.logger.info(`Removed custom dangerous pattern: ${removed.description}`);
        }
    }

    isCommandAllowed(command: string): boolean {
        const result = this.checkCommand(command);
        return !result.blocked;
    }

    /**
     * Compare two risk levels
     * @returns positive if a > b, negative if a < b, 0 if equal
     */
    protected compareRiskLevels(a: RiskLevel, b: RiskLevel): number {
        const order = [RiskLevel.SAFE, RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL];
        return order.indexOf(a) - order.indexOf(b);
    }
}
