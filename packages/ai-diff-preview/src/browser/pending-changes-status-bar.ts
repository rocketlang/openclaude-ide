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
import { StatusBar, StatusBarAlignment, StatusBarEntry } from '@theia/core/lib/browser/status-bar/status-bar';
import { ChangeTrackerService } from '../common';
import { DiffCommands } from './diff-commands';

const PENDING_CHANGES_STATUS_BAR_ID = 'ai-pending-changes-status';

/**
 * Status bar contribution showing pending AI changes count
 */
@injectable()
export class PendingChangesStatusBar {

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(ChangeTrackerService)
    protected readonly changeTracker: ChangeTrackerService;

    @postConstruct()
    protected init(): void {
        // Set initial status
        this.updateStatusBar();

        // Subscribe to change updates
        this.changeTracker.onChangesUpdated(() => {
            this.updateStatusBar();
        });
    }

    protected updateStatusBar(): void {
        const count = this.changeTracker.getPendingCount();

        let entry: StatusBarEntry;

        if (count > 0) {
            entry = {
                text: `$(diff) ${count} pending`,
                tooltip: `${count} pending AI change${count > 1 ? 's' : ''}\nClick to review`,
                alignment: StatusBarAlignment.RIGHT,
                priority: 99,
                command: DiffCommands.SHOW_DIFF_PREVIEW.id,
                color: 'var(--theia-statusBarItem-warningForeground)'
            };
        } else {
            entry = {
                text: '$(diff)',
                tooltip: 'No pending AI changes',
                alignment: StatusBarAlignment.RIGHT,
                priority: 99,
                command: DiffCommands.SHOW_DIFF_PREVIEW.id
            };
        }

        this.statusBar.setElement(PENDING_CHANGES_STATUS_BAR_ID, entry);
    }
}
