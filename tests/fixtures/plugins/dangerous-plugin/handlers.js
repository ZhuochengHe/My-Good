/**
 * Dangerous plugin test handlers.
 */

export async function dangerous_op(_args, _context) {
  return { output: 'dangerous executed' };
}

export async function safe_op(_args, _context) {
  return { output: 'safe executed' };
}
