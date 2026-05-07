# Premade Audit Report

Generated: 2026-05-07T03:29:35.969Z

## Summary

- Premades audited: **40**
- Total errors:     **6**
- Total warnings:   **21**
- Failed to download/extract: **0** 
- Completely clean: **19** (airtable, google_maps, linear, mongodb, newsapi, notion, open_meteo, openweathermap, pagerduty, perplexity, postmark, reddit, sendgrid, slack, tmdb, twilio, twitter, unsplash, wolfram_alpha)

## Issues grouped by kind (severity-sorted)

### [ERROR] REQUIRED_NOT_IN_PROPS — affects 6 premade(s)

- **box** — **1 occurrence(s)**; samples: `post_oauth2_revoke` (req: grant_type)
- **cloudflare** — **2 occurrence(s)**; samples: `zero_trust_gateway_proxy_endpoints_create_proxy_endpoint` (req: ips), `put_zones_zone_identifier_zaraz_config` (req: tools)
- **digitalocean** — **1 occurrence(s)**; samples: `loadBalancers_remove_droplets` (req: droplet_ids)
- **figma** — **1 occurrence(s)**; samples: `putWebhook` (req: team_id)
- **github** — **2 occurrence(s)**; samples: `checks_create` (req: conclusion), `checks_update` (req: conclusion)
- **spotify** — **2 occurrence(s)**; samples: `save_tracks_user` (req: uris), `save_episodes_user` (req: uris)

### [WARNING] MUTATING_NO_BODY — affects 20 premade(s)

- **algolia** — **4 occurrence(s)**; samples: `replaceSources` (PUT), `deleteObjects` (POST), `partialUpdateObjects` (POST), `partialUpdateObjectsWithTransformation` (POST)
- **asana** — **2 occurrence(s)**; samples: `createAttachmentForObject` (POST), `updateTag` (PUT)
- **box** — **14 occurrence(s)**; samples: `put_files_id_metadata_enterprise_securityClassification_68f4230f` (PUT), `post_files_id_metadata_id_id` (POST), `put_files_id_metadata_id_id` (PUT), `put_files_id_metadata_global_boxSkillsCards` (PUT), `put_folders_id_metadata_enterprise_securityClassificati_b0c956cb` (PUT)...
- **circleci** — **4 occurrence(s)**; samples: `cancelJobByJobID` (POST), `cancelJobByJobNumber` (POST), `approvePendingApprovalJobById` (POST), `cancelWorkflow` (POST)
- **cloudflare** — **230 occurrence(s)**; samples: `mcp_portals_api_sync_server` (POST), `access_short_lived_certificate_c_as_create_a_short_live_f59cff6c` (POST), `access_policies_convert_reusable` (PUT), `access_applications_revoke_service_tokens` (POST), `access_bookmark_applications___deprecated__create_a_boo_ab1cd626` (POST)...
- **digitalocean** — **11 occurrence(s)**; samples: `images_create_custom` (POST), `projects_update_default` (PUT), `registries_validate_name` (POST), `security_create_scan` (POST), `genai_regenerate_agent_api_key` (PUT)...
- **discord** — **24 occurrence(s)**; samples: `upload_application_attachment` (POST), `bulk_set_application_commands` (PUT), `consume_entitlement` (POST), `bulk_set_guild_application_commands` (PUT), `update_application_role_connections_metadata` (PUT)...
- **github** — **2 occurrence(s)**; samples: `apps_create_from_manifest` (POST), `markdown_render_raw` (POST)
- **gitlab** — **86 occurrence(s)**; samples: `postApiV4GroupsIdAccessRequests` (POST), `postApiV4GroupsIdArchive` (POST), `postApiV4GroupsIdUnarchive` (POST), `postApiV4GroupsIdRestore` (POST), `postApiV4GroupsIdProjectsProjectId` (POST)...
- **gmail** — **16 occurrence(s)**; samples: `gmail_users_drafts_create` (POST), `gmail_users_drafts_send` (POST), `gmail_users_drafts_update` (PUT), `gmail_users_messages_insert` (POST), `gmail_users_messages_import` (POST)...
- **jira** — **30 occurrence(s)**; samples: `setCommentProperty` (PUT), `setDashboardItemProperty` (PUT), `restoreCustomField` (POST), `trashCustomField` (POST), `setColumns` (PUT)...
- **openai** — **6 occurrence(s)**; samples: `createTranscription` (POST), `createTranslation` (POST), `createFile` (POST), `cancelFineTune` (POST), `createImageEdit` (POST)...
- **spotify** — **11 occurrence(s)**; samples: `save_library_items` (PUT), `save_episodes_user` (PUT), `follow_artists_users` (PUT), `pause_a_users_playback` (PUT), `skip_users_playback_to_next_track` (POST)...
- **stripe** — **1 occurrence(s)**; samples: `PostFiles` (POST)
- **supabase** — **18 occurrence(s)**; samples: `v1_restore_a_branch` (POST), `v1_update_project_legacy_api_keys` (PUT), `v1_verify_dns_config` (POST), `v1_activate_custom_hostname` (POST), `v1_list_all_network_bans` (POST)...
- **todoist** — **2 occurrence(s)**; samples: `todoist_close_task` (POST), `todoist_reopen_task` (POST)
- **trello** — **85 occurrence(s)**; samples: `put_actions_id` (PUT), `put_actions_id_text` (PUT), `put_boards_id` (PUT), `post_boards_id_labels` (POST), `post_boards_id_lists` (POST)...
- **vercel** — **19 occurrence(s)**; samples: `rerequestCheck` (POST), `cancelDeployment` (PATCH), `updateEdgeConfig` (PUT), `createSharedEnvVariable` (POST), `unlinkSharedEnvVariable` (PATCH)...
- **youtube** — **12 occurrence(s)**; samples: `youtube_captions_insert` (POST), `youtube_captions_update` (PUT), `youtube_channelBanners_insert` (POST), `youtube_comments_markAsSpam` (POST), `youtube_comments_setModerationStatus` (POST)...
- **zoom** — **9 occurrence(s)**; samples: `uploadVB` (POST), `updateUserLevelChannel` (PATCH), `joinChannel` (POST), `updateChannel` (PATCH), `uploadGroupVB` (POST)...

### [WARNING] NO_BASE_URL — affects 1 premade(s)

- **supabase**

## Per-premade overview

| Premade | Tools | Auth template(s) | No-auth | Bodyless mut. | Unresolvable path | Errors | Warnings |
|---|---|---|---|---|---|---|---|
| airtable | 15 | (none) | 15 | 0 | 0 | 0 | 0 |
| algolia | 78 | api_key_header | 0 | 4 | 0 | 0 | 1 |
| asana | 167 | oauth2_auth_code | 0 | 2 | 0 | 0 | 1 |
| box | 296 | oauth2_auth_code | 0 | 14 | 0 | 1 | 1 |
| circleci | 114 | api_key_header | 0 | 4 | 0 | 0 | 1 |
| cloudflare | 2844 | api_key_header | 0 | 230 | 0 | 1 | 1 |
| digitalocean | 599 | bearer_token | 0 | 11 | 0 | 1 | 1 |
| discord | 230 | api_key_header | 0 | 24 | 0 | 0 | 1 |
| figma | 47 | api_key_header | 0 | 0 | 0 | 1 | 0 |
| github | 1112 | (none) | 1112 | 2 | 0 | 1 | 1 |
| gitlab | 1126 | api_key_header | 0 | 86 | 0 | 0 | 1 |
| gmail | 79 | oauth2_auth_code | 0 | 16 | 0 | 0 | 1 |
| google_maps | 10 | (none) | 10 | 0 | 0 | 0 | 0 |
| jira | 487 | oauth2_auth_code | 0 | 30 | 0 | 0 | 1 |
| linear | 5 | (none) | 5 | 0 | 0 | 0 | 0 |
| mongodb | 468 | oauth2_client_creds | 0 | 0 | 0 | 0 | 0 |
| newsapi | 3 | (none) | 3 | 0 | 0 | 0 | 0 |
| notion | 13 | (none) | 13 | 0 | 0 | 0 | 0 |
| open_meteo | 1 | (none) | 1 | 0 | 0 | 0 | 0 |
| openai | 28 | (none) | 28 | 6 | 0 | 0 | 1 |
| openweathermap | 9 | (none) | 9 | 0 | 0 | 0 | 0 |
| pagerduty | 419 | api_key_header | 0 | 0 | 0 | 0 | 0 |
| perplexity | 1 | (none) | 1 | 0 | 0 | 0 | 0 |
| postmark | 23 | (none) | 23 | 0 | 0 | 0 | 0 |
| reddit | 17 | (none) | 17 | 0 | 0 | 0 | 0 |
| sendgrid | 19 | (none) | 19 | 0 | 0 | 0 | 0 |
| slack | 174 | oauth2_auth_code | 0 | 0 | 0 | 0 | 0 |
| spotify | 96 | oauth2_auth_code | 0 | 11 | 0 | 1 | 1 |
| stripe | 587 | basic_auth | 0 | 1 | 0 | 0 | 1 |
| supabase | 161 | bearer_token | 0 | 18 | 0 | 0 | 2 |
| tmdb | 27 | (none) | 27 | 0 | 0 | 0 | 0 |
| todoist | 19 | (none) | 19 | 2 | 0 | 0 | 1 |
| trello | 256 | api_key_query | 0 | 85 | 0 | 0 | 1 |
| twilio | 197 | basic_auth | 0 | 0 | 0 | 0 | 0 |
| twitter | 5 | (none) | 5 | 0 | 0 | 0 | 0 |
| unsplash | 15 | (none) | 15 | 0 | 0 | 0 | 0 |
| vercel | 322 | bearer_token | 0 | 19 | 0 | 0 | 1 |
| wolfram_alpha | 3 | (none) | 3 | 0 | 0 | 0 | 0 |
| youtube | 76 | oauth2_auth_code | 0 | 12 | 0 | 0 | 1 |
| zoom | 373 | api_key_header | 0 | 9 | 0 | 0 | 1 |
