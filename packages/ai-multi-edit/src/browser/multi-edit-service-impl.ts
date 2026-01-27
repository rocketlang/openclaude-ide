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

import { injectable, inject } from '@theia/core/shared/inversify';
import { URI, Path } from '@theia/core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { BaseMultiEditService } from '../common';

@injectable()
export class MultiEditServiceImpl extends BaseMultiEditService {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected async readFile(filePath: string): Promise<string | undefined> {
        try {
            const uri = await this.resolveUri(filePath);
            if (!uri) {
                return undefined;
            }

            const content = await this.fileService.readFile(uri);
            return content.value.toString();
        } catch {
            return undefined;
        }
    }

    protected async writeFile(filePath: string, content: string): Promise<void> {
        const uri = await this.resolveUri(filePath);
        if (!uri) {
            throw new Error(`Cannot resolve path: ${filePath}`);
        }

        // Ensure parent directory exists
        const parentUri = uri.parent;
        const parentExists = await this.fileService.exists(parentUri);
        if (!parentExists) {
            await this.fileService.createFolder(parentUri);
        }

        // Write the file
        const { BinaryBuffer } = await import('@theia/core/lib/common/buffer');
        const buffer = BinaryBuffer.fromString(content);
        await this.fileService.writeFile(uri, buffer);
    }

    protected async deleteFile(filePath: string): Promise<void> {
        const uri = await this.resolveUri(filePath);
        if (!uri) {
            throw new Error(`Cannot resolve path: ${filePath}`);
        }

        await this.fileService.delete(uri);
    }

    protected async renameFile(oldPath: string, newPath: string): Promise<void> {
        const oldUri = await this.resolveUri(oldPath);
        const newUri = await this.resolveUri(newPath);

        if (!oldUri || !newUri) {
            throw new Error(`Cannot resolve paths for rename`);
        }

        await this.fileService.move(oldUri, newUri);
    }

    protected async fileExists(filePath: string): Promise<boolean> {
        const uri = await this.resolveUri(filePath);
        if (!uri) {
            return false;
        }

        return this.fileService.exists(uri);
    }

    protected async resolveUri(filePath: string): Promise<URI | undefined> {
        const roots = this.workspaceService.tryGetRoots();
        if (roots.length === 0) {
            return undefined;
        }

        const normalizedPath = new Path(Path.normalizePathSeparator(filePath));

        // If absolute, try to find it
        if (normalizedPath.isAbsolute) {
            const uri = new URI(filePath);
            if (await this.fileService.exists(uri)) {
                return uri;
            }
        }

        // Try relative to each workspace root
        for (const root of roots) {
            const uri = root.resource.resolve(normalizedPath);
            // For write operations, we don't need the file to exist
            // Just return the first valid URI
            return uri;
        }

        return undefined;
    }
}
