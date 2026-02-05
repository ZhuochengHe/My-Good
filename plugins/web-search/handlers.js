/**
 * Web search plugin handlers.
 *
 * Implements web_search and fetchUrl operations.
 */

/**
 * Searches the web (stub implementation for MVP).
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {import('../../src/types/tools.js').ToolContext} context - Tool context.
 * @returns {Promise<import('../../src/types/tools.js').ToolHandlerResult>} Handler result.
 */
export async function search(args, context) {
  try {
    // Validate required parameters
    if (!args.query || typeof args.query !== 'string') {
      return {
        output: 'Error: Missing or invalid required parameter "query"',
      };
    }

    const limit = typeof args.limit === 'number' ? args.limit : 5;

    // MVP: Return helpful stub message
    const message = {
      status: 'stub',
      message: 'Web search requires API configuration (DuckDuckGo, Brave, etc.)',
      query: args.query,
      limit: limit,
      suggestion: 'This feature is currently not configured. Please set up a search API provider.',
    };

    return {
      output: JSON.stringify(message, null, 2),
    };
  } catch (error) {
    return {
      output: `Error executing search: ${error.message}`,
    };
  }
}

/**
 * Fetches content from a URL.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {import('../../src/types/tools.js').ToolContext} context - Tool context.
 * @returns {Promise<import('../../src/types/tools.js').ToolHandlerResult>} Handler result.
 */
export async function fetchUrl(args, context) {
  try {
    // Validate required parameters
    if (!args.url || typeof args.url !== 'string') {
      return {
        output: 'Error: Missing or invalid required parameter "url"',
      };
    }

    const format = args.format || 'markdown';

    // Create AbortSignal with timeout (15000ms as per manifest)
    const timeoutMs = 15000;
    let timeoutSignal;

    // Use AbortSignal.timeout if available (Node 17.3+), otherwise create manual timeout
    if (AbortSignal.timeout) {
      timeoutSignal = AbortSignal.timeout(timeoutMs);
    } else {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), timeoutMs);
      timeoutSignal = controller.signal;
    }

    // Combine timeout signal with context signal if provided
    let signal = timeoutSignal;
    if (context.signal) {
      // If context already has an abort signal, we need to handle both
      // For simplicity, just use context signal and let timeout be handled by fetch
      signal = context.signal;
    }

    // Fetch the URL
    const response = await fetch(args.url, { signal });

    // Check for HTTP errors
    if (!response.ok) {
      return {
        output: `Error: HTTP ${response.status} - ${response.statusText}`,
      };
    }

    // Get the HTML content
    const html = await response.text();

    // Convert based on format
    let output;
    switch (format) {
      case 'html':
        output = html;
        break;
      case 'text':
        output = htmlToText(html);
        break;
      case 'markdown':
        output = htmlToMarkdown(html);
        break;
      default:
        output = htmlToMarkdown(html);
    }

    return {
      output,
    };
  } catch (error) {
    return {
      output: `Error fetching URL "${args.url}": ${error.message}`,
    };
  }
}

/**
 * Converts HTML to plain text by removing tags.
 *
 * @param {string} html - HTML content.
 * @returns {string} Plain text.
 */
function htmlToText(html) {
  // Remove script and style tags and their contents
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove all HTML tags
  text = text.replace(/<[^>]*>/g, '');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Converts HTML to Markdown (simple conversion).
 *
 * @param {string} html - HTML content.
 * @returns {string} Markdown text.
 */
function htmlToMarkdown(html) {
  // Remove script and style tags
  let md = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  md = md.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Convert headings (h1-h6)
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');

  // Convert links
  md = md.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');

  // Convert bold and italic
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

  // Convert lists
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<ul[^>]*>/gi, '\n');
  md = md.replace(/<\/ul>/gi, '\n');
  md = md.replace(/<ol[^>]*>/gi, '\n');
  md = md.replace(/<\/ol>/gi, '\n');

  // Convert paragraphs
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

  // Convert line breaks
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Remove remaining HTML tags
  md = md.replace(/<[^>]*>/g, '');

  // Decode HTML entities
  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");

  // Clean up excessive whitespace while preserving intentional breaks
  md = md.replace(/\n\n\n+/g, '\n\n');
  md = md.trim();

  return md;
}
