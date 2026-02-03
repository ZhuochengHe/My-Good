/**
 * Test plugin handlers.
 */

export async function test_tool(args, context) {
  return {
    output: `Echo: ${args.message}`,
  };
}
