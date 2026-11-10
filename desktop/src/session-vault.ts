import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface SessionProtection {
  available: () => Promise<boolean>;
  encrypt: (value: string) => Promise<Buffer>;
  decrypt: (value: Buffer) => Promise<string>;
}
interface StoredSession { origin: string; refreshToken: string; expiresAt: number }

export class SessionVault {
  private memory: StoredSession | null = null;
  private loaded = false;
  private writeFailed = false;
  private readonly filename: string;
  constructor(private readonly directory: string, private readonly origin: string, private readonly protection: SessionProtection) {
    this.filename = join(directory, `session-${createHash('sha256').update(origin).digest('hex')}.bin`);
  }
  async persistence(): Promise<'encrypted' | 'memory'> {
    return !this.writeFailed && await this.protection.available().catch(() => false) ? 'encrypted' : 'memory';
  }
  async get(): Promise<string | null> {
    if (!this.loaded) {
      this.loaded = true;
      if (await this.persistence() === 'encrypted') {
        try {
          const encrypted = await readFile(this.filename);
          if (encrypted.byteLength > 16_384) throw new Error('Invalid session file');
          const record: unknown = JSON.parse(await this.protection.decrypt(encrypted));
          if (record && typeof record === 'object' && 'origin' in record && record.origin === this.origin
            && 'refreshToken' in record && typeof record.refreshToken === 'string' && record.refreshToken.length <= 4096
            && 'expiresAt' in record && typeof record.expiresAt === 'number' && record.expiresAt > Date.now()) {
            this.memory = record as StoredSession;
          }
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) this.writeFailed = true;
        }
      }
    }
    if (!this.memory || this.memory.expiresAt <= Date.now()) return null;
    return this.memory.refreshToken;
  }
  async save(refreshToken: string, refreshExpiresIn: number) {
    if (!refreshToken || refreshToken.length > 4096 || !Number.isSafeInteger(refreshExpiresIn) || refreshExpiresIn < 1 || refreshExpiresIn > 31 * 24 * 3600) {
      throw new Error('Invalid persistent session');
    }
    this.loaded = true;
    this.memory = { origin: this.origin, refreshToken, expiresAt: Date.now() + refreshExpiresIn * 1000 };
    this.writeFailed = false;
    if (await this.persistence() !== 'encrypted') { await rm(this.filename, { force: true }).catch(() => {}); return; }
    const temporary = `${this.filename}.tmp`;
    try {
      const encrypted = await this.protection.encrypt(JSON.stringify(this.memory));
      await mkdir(this.directory, { recursive: true });
      await writeFile(temporary, encrypted, { mode: 0o600 });
      await rename(temporary, this.filename);
    } catch {
      this.writeFailed = true;
      await rm(temporary, { force: true }).catch(() => {});
      await rm(this.filename, { force: true }).catch(() => {});
    }
  }
  async clear() {
    this.loaded = true; this.memory = null;
    await rm(this.filename, { force: true });
  }
}
