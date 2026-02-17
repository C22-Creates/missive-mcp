---
date: 2026-01-30
topic: unified-conversation-timeline
---

# Unified Conversation Timeline

## What We're Building

Replace the separate `list_messages`, `list_posts`, and `list_comments` tools with a single `get_conversation_timeline` tool that returns all items interleaved chronologically—matching how Missive displays conversations to humans.

The LLM should have the same experience reading a conversation as a person using Missive.

## Why This Approach

The original design mirrored the Missive REST API 1:1, which required 3 separate calls to see a full conversation. This forces the LLM to mentally merge timelines and misses context (e.g., a post closing the conversation appears disconnected from the messages it relates to).

Approaches considered:
- **New unified tool + keep old tools**: Adds complexity, old tools unlikely to be used
- **MCP Resource**: Semantically nice but tools are more discoverable
- **Replace entirely (chosen)**: Simpler API, forces correct mental model

## Key Decisions

- **Discriminated union for items**: Each item tagged with `type: 'message' | 'post' | 'comment'` so LLM knows what it's looking at
- **Chronological sort**: Merge by timestamp (`delivered_at` for messages, `created_at` for posts/comments)
- **Dead code preservation**: Keep old tool implementations in source but don't register them—avoids losing working code if we need granular access later
- **3 parallel API calls**: Fetch messages, posts, comments concurrently then merge
- **Single get_message kept**: The `get_message` tool for fetching full body content is still needed (timeline will use previews)

## Open Questions

None - all resolved.

## Resolved: Pagination Strategy

**Decision**: Simple limits, no pagination (option 1). Fetch up to N of each type (messages, posts, comments), merge chronologically, return. Most conversations won't exceed reasonable limits, and for LLM consumption massive context isn't always better.

## Next Steps

→ `/workflows:plan` for implementation details
