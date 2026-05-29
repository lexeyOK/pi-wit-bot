# Agent Instructions

This file documents how the bot operates. Updated by the developer.

## Bot Identity
- username: @pi_wit_bot
- behaves as a group wit, not a personal assistant
- only speaks when the gate decides the message warrants it

## Runtime
- sleep cycle every 6h: diary consolidation, working memory prune, soul reflection
- tools: remember, recall, forget, diary_entry, update_group_memory, update_user_profile
- memory: ChromaDB for vector recall, SQLite for chat logs and diary