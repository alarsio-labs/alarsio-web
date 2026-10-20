import { supabasePhotoStorage, pickAndCompress, PHOTO_MAX_SIDE, PHOTO_QUALITY, expoPhotoFiles } from '../photo-device';

// The three Expo modules are native; Jest gets small stand-ins that record what was asked.
const mockPicker = {
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
};
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: (...a: unknown[]) => mockPicker.requestCameraPermissionsAsync(...a),
  requestMediaLibraryPermissionsAsync: (...a: unknown[]) => mockPicker.requestMediaLibraryPermissionsAsync(...a),
  launchCameraAsync: (...a: unknown[]) => mockPicker.launchCameraAsync(...a),
  launchImageLibraryAsync: (...a: unknown[]) => mockPicker.launchImageLibraryAsync(...a),
}));

const mockManip = { resize: jest.fn(), saveAsync: jest.fn() };
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      resize: (size: unknown) => mockManip.resize(size),
      renderAsync: async () => ({ saveAsync: (o: unknown) => mockManip.saveAsync(o) }),
    }),
  },
}));

const mockFs = { files: new Map<string, number>(), copies: [] as string[], deleted: [] as string[] };
jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() {
      return mockFs.files.has(this.uri);
    }
    get size() {
      return mockFs.files.get(this.uri) ?? 0;
    }
    copy(dest: File) {
      mockFs.copies.push(`${this.uri}->${dest.uri}`);
      mockFs.files.set(dest.uri, mockFs.files.get(this.uri) ?? 0);
    }
    async bytes() {
      return new Uint8Array(this.size);
    }
    delete() {
      mockFs.deleted.push(this.uri);
      mockFs.files.delete(this.uri);
    }
  }
  return { File, Directory, Paths: { document: { uri: 'file:///doc' } } };
});

const USER = '11111111-0000-4000-8000-00000000000a';
const OTHER = '22222222-0000-4000-8000-00000000000b';

describe('photo device adapters (#81 PR 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.files.clear();
    mockFs.copies.length = 0;
    mockFs.deleted.length = 0;
  });

  describe('pickAndCompress', () => {
    const asset = (width: number, height: number) => ({ canceled: false, assets: [{ uri: 'file:///cache/raw.jpg', width, height }] });

    it('asks permission first, and says denied without opening the camera', async () => {
      mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
      expect(await pickAndCompress('camera')).toEqual({ kind: 'denied' });
      expect(mockPicker.launchCameraAsync).not.toHaveBeenCalled();
    });

    it('says cancelled when the supervisor backs out', async () => {
      mockPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
      mockPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
      expect(await pickAndCompress('library')).toEqual({ kind: 'cancelled' });
    });

    it('takes images only, one at a time, with no cropping', async () => {
      mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
      mockPicker.launchCameraAsync.mockResolvedValue(asset(800, 600));
      mockManip.saveAsync.mockResolvedValue({ uri: 'file:///cache/out.jpg' });
      await pickAndCompress('camera');
      expect(mockPicker.launchCameraAsync).toHaveBeenCalledWith(
        expect.objectContaining({ mediaTypes: ['images'], allowsEditing: false, quality: 1 }),
      );
    });

    it('shrinks the long side to the limit, whichever side is long, and saves a JPEG at the set quality', async () => {
      mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
      mockManip.saveAsync.mockResolvedValue({ uri: 'file:///cache/out.jpg' });

      mockPicker.launchCameraAsync.mockResolvedValue(asset(4000, 3000));
      expect(await pickAndCompress('camera')).toEqual({ kind: 'picked', uri: 'file:///cache/out.jpg' });
      expect(mockManip.resize).toHaveBeenLastCalledWith({ width: PHOTO_MAX_SIDE });

      mockPicker.launchCameraAsync.mockResolvedValue(asset(3000, 4000));
      await pickAndCompress('camera');
      expect(mockManip.resize).toHaveBeenLastCalledWith({ height: PHOTO_MAX_SIDE });
      expect(mockManip.saveAsync).toHaveBeenLastCalledWith({ format: 'jpeg', compress: PHOTO_QUALITY });
    });

    it('does not enlarge a small photo, and still re-encodes it as a JPEG', async () => {
      mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
      mockPicker.launchCameraAsync.mockResolvedValue(asset(800, 600));
      mockManip.saveAsync.mockResolvedValue({ uri: 'file:///cache/out.jpg' });
      await pickAndCompress('camera');
      expect(mockManip.resize).not.toHaveBeenCalled();
      expect(mockManip.saveAsync).toHaveBeenCalledTimes(1);
    });

    it('turns any failure into a fixed failed result, never the error text', async () => {
      mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
      mockPicker.launchCameraAsync.mockRejectedValue(new Error('file:///data/user/0/secret'));
      expect(await pickAndCompress('camera')).toEqual({ kind: 'failed' });
    });
  });

  describe('expoPhotoFiles', () => {
    it('copies the picked file into the app folder under the photo id and reports its size', async () => {
      mockFs.files.set('file:///cache/out.jpg', 4321);
      const kept = await expoPhotoFiles.keep('file:///cache/out.jpg', 'abc');
      expect(kept.sizeBytes).toBe(4321);
      expect(kept.uri).toBe('file:///doc/report-photos/abc.jpg');
      expect(mockFs.copies).toEqual(['file:///cache/out.jpg->file:///doc/report-photos/abc.jpg']);
    });

    it('removes the compressed cache file after keeping a copy', async () => {
      mockFs.files.set('file:///cache/out.jpg', 10);
      await expoPhotoFiles.keep('file:///cache/out.jpg', 'abc');
      expect(mockFs.deleted).toContain('file:///cache/out.jpg');
    });

    it('reads bytes, and removing a file already gone is not an error', async () => {
      mockFs.files.set('file:///doc/report-photos/x.jpg', 7);
      expect((await expoPhotoFiles.read('file:///doc/report-photos/x.jpg')).length).toBe(7);
      await expoPhotoFiles.remove('file:///doc/report-photos/x.jpg');
      await expect(expoPhotoFiles.remove('file:///doc/report-photos/x.jpg')).resolves.toBeUndefined();
    });
  });

  describe('supabasePhotoStorage', () => {
    function client(opts: { sessionUser?: string | null; error?: { status?: number; statusCode?: string; message?: string } | null; throws?: boolean }) {
      const uploads: { bucket: string; path: string; options: Record<string, unknown> }[] = [];
      const supabase = {
        auth: {
          getSession: async () => ({
            data: { session: opts.sessionUser === null ? null : { user: { id: opts.sessionUser ?? USER }, access_token: 'tok-1' } },
          }),
        },
        storage: {
          from: (bucket: string) => ({
            upload: async (path: string, _bytes: Uint8Array, options: Record<string, unknown>) => {
              uploads.push({ bucket, path, options });
              if (opts.throws) throw new Error('network down /data/x');
              return { data: opts.error ? null : { path }, error: opts.error ?? null };
            },
          }),
        },
      };
      return { supabase: supabase as never, uploads };
    }
    const send = (c: ReturnType<typeof client>, userId = USER) =>
      supabasePhotoStorage(c.supabase).upload(userId, 'o/s/r/p.jpg', new Uint8Array(3), 'image/jpeg');

    it("uploads to the private report-photos bucket under the author's own token, never overwriting", async () => {
      const c = client({});
      expect(await send(c)).toBe('uploaded');
      expect(c.uploads).toEqual([
        {
          bucket: 'report-photos',
          path: 'o/s/r/p.jpg',
          options: { contentType: 'image/jpeg', upsert: false, headers: { Authorization: 'Bearer tok-1' } },
        },
      ]);
    });

    it("refuses to upload under someone else's session, or with none, and sends nothing (ADR-020)", async () => {
      const other = client({ sessionUser: OTHER });
      await expect(send(other)).resolves.toBe('retry');
      expect(other.uploads).toEqual([]);

      const none = client({ sessionUser: null });
      await expect(send(none)).resolves.toBe('retry');
      expect(none.uploads).toEqual([]);
    });

    it('counts an object that already exists as a replay', async () => {
      expect(await send(client({ error: { statusCode: '409', message: 'The resource already exists' } }))).toBe('exists');
      expect(await send(client({ error: { status: 409 } }))).toBe('exists');
    });

    it.each([[400], [401], [403], [413], [415]])('treats a %i answer as a refusal, not a retry', async (status) => {
      expect(await send(client({ error: { status } }))).toBe(status === 401 ? 'retry' : 'refused');
    });

    it('retries a server error, a rate limit and a network failure', async () => {
      expect(await send(client({ error: { status: 500 } }))).toBe('retry');
      expect(await send(client({ error: { status: 429 } }))).toBe('retry');
      expect(await send(client({ error: {} }))).toBe('retry');
      expect(await send(client({ throws: true }))).toBe('retry');
    });
  });
});
