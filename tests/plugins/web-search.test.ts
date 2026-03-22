/**
 * Web search plugin tests (TDD - written first).
 *
 * Tests search and fetchUrl handlers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ToolContext, ToolHandlerResult } from '../../src/types/tools.js';

// Import handlers from the plugin (JavaScript module)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let search: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fetchUrl: any;

// Mock fetch globally for all tests
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('web-search plugin', () => {
  let mockContext: ToolContext;

  beforeEach(async () => {
    mockContext = {
      sessionId: 'test-session',
      workingDirectory: '/tmp/test',
      env: {},
    };

    // Reset fetch mock
    mockFetch.mockReset();

    // Dynamically import the handlers
    const handlers = await import(
      '../../plugins/web-search/handlers.js'
    );
    search = handlers.search;
    fetchUrl = handlers.fetchUrl;
  });

  /** Minimal DuckDuckGo HTML with N result blocks. */
  function makeDDGHtml(titles: string[]): string {
    const results = titles
      .map(
        (t, i) =>
          `<h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample${i}.com">${t}</a></h2>` +
          `<a class="result__snippet">Snippet for ${t}</a>`
      )
      .join('\n');
    return `<html><body>${results}</body></html>`;
  }

  describe('search handler', () => {
    it('returns search results for a valid query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => makeDDGHtml(['Result One', 'Result Two', 'Result Three']),
      });

      const result: ToolHandlerResult = await search(
        { query: 'test query', limit: 3 },
        mockContext
      );

      expect(result.output).toContain('test query');
      expect(result.output).toContain('Result One');
    });

    it('handles missing query parameter', async () => {
      const result: ToolHandlerResult = await search(
        {},
        mockContext
      );

      expect(result.output).toContain('Error');
      expect(result.output).toContain('query');
    });

    it('respects limit parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => makeDDGHtml(['A', 'B', 'C', 'D', 'E']),
      });

      const result: ToolHandlerResult = await search(
        { query: 'test', limit: 2 },
        mockContext
      );

      // Only 2 results should appear
      expect(result.output).toContain('1.');
      expect(result.output).toContain('2.');
      expect(result.output).not.toContain('3.');
    });

    it('uses default limit of 5 when not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => makeDDGHtml(['A', 'B', 'C', 'D', 'E', 'F']),
      });

      const result: ToolHandlerResult = await search(
        { query: 'test' },
        mockContext
      );

      expect(result.output).toContain('5.');
      expect(result.output).not.toContain('6.');
    });

    it('returns no-results message when HTML has no matches', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html><body>No results</body></html>',
      });

      const result: ToolHandlerResult = await search(
        { query: 'test query', limit: 2 },
        mockContext
      );

      expect(result.output).toContain('No results');
    });

    it('handles invalid query type gracefully', async () => {
      const result: ToolHandlerResult = await search(
        { query: null as unknown as string },
        mockContext
      );

      expect(result.output).toContain('Error');
    });

    it('handles invalid limit type gracefully', async () => {
      const result: ToolHandlerResult = await search(
        { query: 'test', limit: 'invalid' as unknown as number },
        mockContext
      );

      expect(result.output).toBeTruthy();
    });
  });

  describe('fetchUrl handler', () => {

    it('fetches valid URLs successfully with HTML format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html><body><h1>Test Page</h1></body></html>',
      });

      const result: ToolHandlerResult = await fetchUrl(
        { url: 'https://example.com', format: 'html' },
        mockContext
      );

      expect(result.output).toContain('<h1>Test Page</h1>');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('returns text format (stripped HTML)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html><body><p>Plain text here</p></body></html>',
      });

      const result: ToolHandlerResult = await fetchUrl(
        { url: 'https://example.com', format: 'text' },
        mockContext
      );

      expect(result.output).toContain('Plain text here');
      expect(result.output).not.toContain('<p>');
      expect(result.output).not.toContain('<html>');
    });

    it('returns markdown format (converted)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html><body><h1>Title</h1><p>Paragraph</p></body></html>',
      });

      const result: ToolHandlerResult = await fetchUrl(
        { url: 'https://example.com', format: 'markdown' },
        mockContext
      );

      expect(result.output).toContain('# Title');
      expect(result.output).toContain('Paragraph');
    });

    it('uses markdown format by default', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html><body><h1>Default Format</h1></body></html>',
      });

      const result: ToolHandlerResult = await fetchUrl(
        { url: 'https://example.com' },
        mockContext
      );

      expect(result.output).toContain('# Default Format');
    });

    it('handles 404 errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Not Found',
      });

      const result: ToolHandlerResult = await fetchUrl(
        { url: 'https://example.com/notfound' },
        mockContext
      );

      expect(result.output).toContain('Error');
      expect(result.output).toContain('404');
    });

    it('handles 500 errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server Error',
      });

      const result: ToolHandlerResult = await fetchUrl(
        { url: 'https://example.com/error' },
        mockContext
      );

      expect(result.output).toContain('Error');
      expect(result.output).toContain('500');
    });

    it('handles invalid URLs', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Invalid URL'));

      const result: ToolHandlerResult = await fetchUrl(
        { url: 'not-a-valid-url' },
        mockContext
      );

      expect(result.output).toContain('Error');
    });

    it('handles network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result: ToolHandlerResult = await fetchUrl(
        { url: 'https://example.com' },
        mockContext
      );

      expect(result.output).toContain('Error');
      expect(result.output).toContain('Network error');
    });

    it('handles timeout expiration', async () => {
      mockFetch.mockRejectedValueOnce(new Error('The operation was aborted'));

      const result: ToolHandlerResult = await fetchUrl(
        { url: 'https://example.com' },
        mockContext
      );

      expect(result.output).toContain('Error');
    });

    it('respects AbortSignal cancellation', async () => {
      const abortController = new AbortController();
      mockContext.signal = abortController.signal;

      mockFetch.mockImplementationOnce(() => {
        abortController.abort();
        return Promise.reject(new Error('The operation was aborted'));
      });

      const result: ToolHandlerResult = await fetchUrl(
        { url: 'https://example.com' },
        mockContext
      );

      expect(result.output).toContain('Error');
    });

    it('validates required url parameter', async () => {
      const result: ToolHandlerResult = await fetchUrl(
        {},
        mockContext
      );

      expect(result.output).toContain('Error');
      expect(result.output).toContain('url');
    });

    it('handles null url parameter', async () => {
      const result: ToolHandlerResult = await fetchUrl(
        { url: null as unknown as string },
        mockContext
      );

      expect(result.output).toContain('Error');
    });

    it('handles undefined url parameter', async () => {
      const result: ToolHandlerResult = await fetchUrl(
        { url: undefined as unknown as string },
        mockContext
      );

      expect(result.output).toContain('Error');
    });
  });

  describe('edge cases', () => {

    it('handles HTML with nested tags in text format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<div><span><b>Nested</b> content</span></div>',
      });

      const result: ToolHandlerResult = await fetchUrl(
        { url: 'https://example.com', format: 'text' },
        mockContext
      );

      expect(result.output).toContain('Nested content');
      expect(result.output).not.toContain('<');
      expect(result.output).not.toContain('>');
    });

    it('handles HTML with links in markdown format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<a href="https://example.com">Link text</a>',
      });

      const result: ToolHandlerResult = await fetchUrl(
        { url: 'https://example.com', format: 'markdown' },
        mockContext
      );

      expect(result.output).toContain('[Link text]');
      expect(result.output).toContain('(https://example.com)');
    });

    it('handles HTML with lists in markdown format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<ul><li>Item 1</li><li>Item 2</li></ul>',
      });

      const result: ToolHandlerResult = await fetchUrl(
        { url: 'https://example.com', format: 'markdown' },
        mockContext
      );

      expect(result.output).toContain('- Item 1');
      expect(result.output).toContain('- Item 2');
    });

    it('handles empty HTML body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html><body></body></html>',
      });

      const result: ToolHandlerResult = await fetchUrl(
        { url: 'https://example.com', format: 'text' },
        mockContext
      );

      // Empty HTML should return empty string (valid output)
      expect(result.output).toBeDefined();
      expect(typeof result.output).toBe('string');
    });

    it('handles large HTML content', async () => {
      const largeHtml = '<html><body>' + '<p>Content</p>'.repeat(1000) + '</body></html>';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => largeHtml,
      });

      const result: ToolHandlerResult = await fetchUrl(
        { url: 'https://example.com', format: 'text' },
        mockContext
      );

      expect(result.output).toContain('Content');
      expect(result.output.length).toBeLessThan(largeHtml.length);
    });

    it('handles special characters in URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html><body>Success</body></html>',
      });

      const result: ToolHandlerResult = await fetchUrl(
        { url: 'https://example.com/path?query=test&special=value' },
        mockContext
      );

      expect(result.output).toContain('Success');
    });

    it('handles unicode content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html><body>Hello 世界 🌍</body></html>',
      });

      const result: ToolHandlerResult = await fetchUrl(
        { url: 'https://example.com', format: 'text' },
        mockContext
      );

      expect(result.output).toContain('Hello 世界 🌍');
    });
  });
});
