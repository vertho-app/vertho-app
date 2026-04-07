'use server';

/**
 * Robustly extracts JSON from LLM output.
 * Handles markdown code blocks, surrounding text, partial JSON, etc.
 * @param {string} text - Raw LLM output
 * @returns {object|array|null} Parsed JSON or null on failure
 */
export async function extractJSON(text) {
  if (!text || typeof text !== 'string') return null;

  // Strategy 1: Try direct parse (already clean JSON)
  try {
    return JSON.parse(text.trim());
  } catch (_) { /* continue */ }

  // Strategy 2: Extract from ```json ... ``` code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (_) { /* continue */ }
  }

  // Strategy 3: Find first { to last } (object)
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch (_) { /* continue */ }
  }

  // Strategy 4: Find first [ to last ] (array)
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(text.slice(firstBracket, lastBracket + 1));
    } catch (_) { /* continue */ }
  }

  // Strategy 5: Attempt fixing common issues (trailing commas, single quotes)
  try {
    let cleaned = text.slice(
      Math.min(
        firstBrace !== -1 ? firstBrace : Infinity,
        firstBracket !== -1 ? firstBracket : Infinity
      ),
      Math.max(
        lastBrace !== -1 ? lastBrace + 1 : 0,
        lastBracket !== -1 ? lastBracket + 1 : 0
      )
    );
    // Remove trailing commas before } or ]
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(cleaned);
  } catch (_) { /* continue */ }

  return null;
}

/**
 * Extracts content between [TAG] and [/TAG] delimiters and parses as JSON.
 * @param {string} text - Raw LLM output
 * @param {string} tag - Tag name (e.g. 'META', 'EVAL', 'AUDIT')
 * @returns {object|null} Parsed JSON or null
 */
export async function extractBlock(text, tag) {
  if (!text || !tag) return null;
  const regex = new RegExp(`\\[${tag}\\]\\s*([\\s\\S]*?)\\[\\/${tag}\\]`, 'i');
  const match = text.match(regex);
  if (!match) return null;
  return extractJSON(match[1]);
}

/**
 * Removes all [TAG]...[/TAG] blocks from text, returning only visible content.
 * @param {string} text - Raw LLM output
 * @returns {string} Clean text without metadata blocks
 */
export async function stripBlocks(text) {
  if (!text) return '';
  return text
    .replace(/\[META\][\s\S]*?\[\/META\]/gi, '')
    .replace(/\[EVAL\][\s\S]*?\[\/EVAL\]/gi, '')
    .replace(/\[AUDIT\][\s\S]*?\[\/AUDIT\]/gi, '')
    .trim();
}
