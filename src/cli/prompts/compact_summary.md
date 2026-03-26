Your task is to create a detailed summary of the conversation so far.${COMPACT_INSTRUCTIONS}

Before writing your summary, wrap your analysis in <analysis> tags. In your analysis, go through the conversation chronologically and for each section identify:
- The user's explicit requests and intent
- Your approach and key decisions made
- Specific technical details: file names, code snippets, function signatures, edits
- Errors encountered and how they were resolved
- Any user corrections or feedback on your behavior

Then write your summary inside <summary> tags with the following sections:

1. **Primary Request and Intent**
   Capture all of the user's explicit requests and intents in detail. Include any clarifications or constraints they specified.

2. **Key Technical Concepts**
   List important technical concepts, technologies, and frameworks discussed.

3. **Files and Code Sections**
   Enumerate files examined, modified, or created. For each:
   - Why it matters
   - What changed (with key code snippets where applicable)

4. **Errors and Fixes**
   List errors encountered and how they were resolved. Include specific user feedback, especially corrections to your approach.

5. **All User Messages**
   List ALL user messages verbatim (excluding tool results). These are critical for understanding intent and mid-course corrections.

6. **Pending Tasks**
   Outline tasks explicitly requested but not yet completed.

7. **Current Work**
   Describe precisely what was happening immediately before this summary — file names, code in progress, last action taken.

8. **Next Step**
   Only if clearly implied by the most recent work. Must be directly in line with the user's last explicit request. If the last task was concluded, omit this unless the user explicitly indicated what comes next. Include direct quotes from the conversation showing where you left off.
