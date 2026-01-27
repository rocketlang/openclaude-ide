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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { MemoryIntegrationService } from './memory-integration';
import { MemoryCommands } from './memory-commands';

const AI_MEMORY_STATUS_BAR_ID = 'ai-memory-status';

@injectable()
export class MemoryStatusBarContribution implements FrontendApplicationContribution {

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(MemoryIntegrationService)
    protected readonly memoryIntegration: MemoryIntegrationService;

    protected updateInterval: ReturnType<typeof setInterval> | undefined;

    @postConstruct()
    protected init(): void {
        // Listen for context updates
        this.memoryIntegration.onContextUpdate(() => {
            this.updateStatusBar();
        });
    }

    async onStart(): Promise<void> {
        // Initial update
        await this.updateStatusBar();

        // Periodic updates every 30 seconds
        this.updateInterval = setInterval(() => {
            this.updateStatusBar();
        }, 30000);
    }

    onStop(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }

    protected async updateStatusBar(): Promise<void> {
        try {
            const stats = await this.memoryIntegration.getStats();

            const entryCount = stats.memory.totalEntries;
            const cacheHitRate = (stats.cache.hitRate * 100).toFixed(0);

            let icon = '$(database)';
            let text = `${entryCount} memories`;

            if (stats.cache.hitRate > 0.8) {
                icon = '$(zap)'; // High performance
            } else if (stats.cache.hitRate > 0.5) {
                icon = '$(database)'; // Normal
            } else {
                icon = '$(history)'; // Learning
            }

            this.statusBar.setElement(AI_MEMORY_STATUS_BAR_ID, {
                text: `${icon} AI: ${text}`,
                tooltip: `AI Memory: ${entryCount} entries | Cache: ${cacheHitRate}% hit rate | Session: ${stats.recentConversations} conversations`,
                alignment: StatusBarAlignment.RIGHT,
                priority: 100,
                command: MemoryCommands.SHOW_MEMORY_PANEL.id
            });
        } catch (e) {
            this.statusBar.setElement(AI_MEMORY_STATUS_BAR_ID, {
                text: '$(database) AI: --',
                tooltip: 'AI Memory: Unable to load stats',
                alignment: StatusBarAlignment.RIGHT,
                priority: 100,
                command: MemoryCommands.SHOW_MEMORY_PANEL.id
            });
        }
    }
}
