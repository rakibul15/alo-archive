import { expect, test } from '@playwright/test';

/**
 * The one flow in this app that has actually broken twice during manual
 * testing (the queue panel collapsing to one row, the batch-summary card's
 * text clipping) — both times because a real failure state changed the
 * page's shape in a way a clean, always-succeeds run never exercises. This
 * test drives the flow the way an operator actually meets it: a file fails,
 * automatic retries exhaust, and a manual retry has to recover it.
 *
 * Targets `PUT .../parts/:n` specifically — session creation, the resume
 * check, and completion are left alone, so this exercises the same resumable
 * path a real dropped connection would: each retry (automatic or manual)
 * re-uses the session already opened rather than starting a new one, exactly
 * like `README.md` → "Uploads are chunked and resumable" describes.
 *
 * The failure is forced via network interception rather than the app's own
 * `SIM_FAILURE_RATE` — that's randomised and capped at a 50%-per-attempt
 * ceiling by its own schema, so it can't deterministically fail a specific
 * upload the number of times a test needs.
 */
test.describe('upload → failure → retry', () => {
  test('a failed upload can be retried to success', async ({ page }) => {
    let attempts = 0;

    // Fail the first three part uploads (matching
    // NEXT_PUBLIC_MAX_UPLOAD_ATTEMPTS' default) with a retryable 503, exactly
    // the shape the real route returns for SIM_FAILURE_RATE. Every attempt
    // after that passes through to the real mock backend and succeeds.
    await page.route('**/api/uploads/sessions/*/parts/*', async (route) => {
      attempts += 1;
      if (attempts <= 3) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'UPSTREAM_UNAVAILABLE',
              message: 'Ingest service is temporarily unavailable',
            },
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/upload');

    // The dropzone's own input, not the "select a whole folder" input further
    // down the page — both are `input[type="file"]`, but the dropzone's is
    // the one react-dropzone renders first.
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: 'field-record.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.alloc(500_000, 'a'),
      });

    // Automatic retries exhaust across a few seconds of exponential backoff
    // (up to ~3.5s of delay plus ~3 attempts' worth of simulated ingest
    // latency) before the item lands on the terminal "Failed" state.
    const row = page.getByText('field-record.pdf').locator('..').locator('..');
    await expect(row.getByText('Failed', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole('heading', { name: 'Batch finished with failures' }),
    ).toBeVisible();

    // Manual retry resets the attempt budget; the 4th request onward is no
    // longer intercepted, so this one reaches the real handler and succeeds.
    await row.getByRole('button', { name: /retry field-record\.pdf/i }).click();

    await expect(row.getByText('Uploaded', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole('heading', { name: 'Batch complete' }),
    ).toBeVisible();
    await expect(page.getByText('1 accepted')).toBeVisible();

    expect(attempts).toBeGreaterThanOrEqual(4);
  });
});
