import {
  buildPhotoPayload,
  checkPhotoSize,
  parsePhotoPayload,
  PHOTO_CONTENT_TYPE,
  PHOTO_LIMITS,
  photoErrorText,
  PhotoError,
  photoPath,
  photoStatusText,
} from '../photo';

const ORG = '0A0A0A0A-0000-4000-8000-0000000000A1';
const SITE = '51000000-0000-4000-8000-000000000001';
const REPORT = 'dddddddd-0000-4000-8000-000000000001';
const PHOTO = 'eeeeeeee-0000-4000-8000-000000000009';

const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof PhotoError) return e.code;
    throw e;
  }
  throw new Error('expected a PhotoError');
};

describe('photo model (#81 PR 2)', () => {
  describe('the path report_photos_path_shape requires (ADR-013 R8)', () => {
    it('is org/site/report/photo.jpg, lower case, from the report itself', () => {
      expect(photoPath({ orgId: ORG, siteId: SITE }, REPORT, PHOTO)).toBe(
        `${ORG.toLowerCase()}/${SITE}/${REPORT}/${PHOTO}.jpg`,
      );
    });

    it('stores every photo as a JPEG, since the phone compresses to one (P1)', () => {
      expect(PHOTO_CONTENT_TYPE).toBe('image/jpeg');
    });
  });

  describe('the payload sync_report_photos reads (ADR-022 H7)', () => {
    it('has exactly the handler fields with their JSON types', () => {
      const payload = buildPhotoPayload({
        reportId: REPORT,
        storagePath: photoPath({ orgId: ORG, siteId: SITE }, REPORT, PHOTO),
        sizeBytes: 123_456,
      });
      expect(payload).toEqual({
        report_id: REPORT,
        storage_path: `${ORG.toLowerCase()}/${SITE}/${REPORT}/${PHOTO}.jpg`,
        size_bytes: 123_456,
        content_type: 'image/jpeg',
        caption: null,
      });
    });

    it('reads back what it wrote, and refuses anything else', () => {
      const payload = buildPhotoPayload({ reportId: REPORT, storagePath: 'a/b/c/d.jpg', sizeBytes: 9 });
      expect(parsePhotoPayload(payload)).toEqual({ reportId: REPORT, storagePath: 'a/b/c/d.jpg', sizeBytes: 9 });
      expect(parsePhotoPayload(null)).toBeNull();
      expect(parsePhotoPayload({ ...payload, size_bytes: '9' })).toBeNull();
      expect(parsePhotoPayload({ ...payload, report_id: 7 })).toBeNull();
    });
  });

  describe('the size the bucket and the table allow (ADR-013 R4)', () => {
    it('takes 1 byte to 10 MB', () => {
      expect(() => checkPhotoSize(1)).not.toThrow();
      expect(() => checkPhotoSize(PHOTO_LIMITS.maxBytes)).not.toThrow();
    });

    it('refuses an empty file and one over 10 MB', () => {
      expect(code(() => checkPhotoSize(0))).toBe('empty_file');
      expect(code(() => checkPhotoSize(PHOTO_LIMITS.maxBytes + 1))).toBe('too_large');
      expect(code(() => checkPhotoSize(Number.NaN))).toBe('empty_file');
    });

    it('allows ten photos a report', () => {
      expect(PHOTO_LIMITS.perReport).toBe(10);
    });
  });

  describe('status in plain words (AC 5)', () => {
    it('waits while the details are not on the server yet', () => {
      expect(photoStatusText('pending', null, 'waiting')).toEqual({ tone: 'wait', text: 'Saved on this phone, waiting to send' });
      expect(photoStatusText('failed', 'missing_parent', 'waiting')).toEqual({
        tone: 'wait',
        text: 'Waiting for its report to reach the server',
      });
    });

    it('says the photo is waiting to upload once only the details are on the server', () => {
      expect(photoStatusText('synced', null, 'waiting')).toEqual({ tone: 'wait', text: 'Photo waiting to upload' });
    });

    it('says "On the server" only once the file itself is uploaded', () => {
      expect(photoStatusText('synced', null, 'uploaded')).toEqual({ tone: 'ok', text: 'On the server' });
      expect(photoStatusText('pending', null, 'waiting').text).not.toMatch(/on the server/i);
    });

    it.each([
      ['rejected', 'permission_denied', 'waiting', /can't add photos to this report/],
      ['rejected', 'invalid_input', 'waiting', /ten photos|isn't valid/],
      ['conflict', 'duplicate', 'waiting', /different photo/],
      ['synced', null, 'refused', /would not take this photo/],
    ] as const)('needs attention for %s / %s / %s', (outbox, reason, upload, text) => {
      const shown = photoStatusText(outbox, reason, upload);
      expect(shown.tone).toBe('attention');
      expect(shown.text).toMatch(text);
    });

    it('has a fixed sentence for every error, never the error text', () => {
      for (const c of ['report_not_saved', 'too_many', 'too_large', 'empty_file', 'not_found'] as const) {
        expect(photoErrorText(new PhotoError(c))).toMatch(/\w/);
      }
      expect(photoErrorText(new Error('file:///data/user/0/cache/x.jpg'))).toBe('Could not add the photo. Try again.');
    });
  });
});
