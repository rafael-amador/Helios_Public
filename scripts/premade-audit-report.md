# Premade Audit Report

Generated: 2026-05-07T02:38:15.196Z

## Summary

- Premades audited: **40**
- Total errors:     **25**
- Total warnings:   **21**
- Failed to download/extract: **0** 
- Completely clean: **16** (airtable, google_maps, linear, newsapi, open_meteo, openweathermap, perplexity, postmark, reddit, sendgrid, slack, tmdb, twilio, twitter, unsplash, wolfram_alpha)

## Issues grouped by kind (severity-sorted)

### [ERROR] UNRESOLVABLE_PATH_PARAMS — affects 13 premade(s)

- **algolia** — **48 occurrence(s)**; samples: `customGet`[path], `customPost`[path], `customPut`[path], `customDelete`[path], `searchSingleIndex`[indexName]...
- **asana** — **138 occurrence(s)**; samples: `getAttachment`[attachment_gid], `deleteAttachment`[attachment_gid], `getCustomField`[custom_field_gid], `updateCustomField`[custom_field_gid], `deleteCustomField`[custom_field_gid]...
- **circleci** — **85 occurrence(s)**; samples: `GetOrgClaims`[orgID], `PatchOrgClaims`[orgID], `DeleteOrgClaims`[orgID], `GetProjectClaims`[orgID], `GetProjectClaims`[projectID]...
- **cloudflare** — **338 occurrence(s)**; samples: `dls_account_regional_hostnames_account_list_regions`[account_id], `billable_usage_get_paygo_account_usage`[account_id], `get_accounts_by_account_id_brand_protection_alerts`[account_id], `patch_accounts_by_account_id_brand_protection_alerts`[account_id], `patch_accounts_by_account_id_brand_protection_alerts_clear`[account_id]...
- **digitalocean** — **329 occurrence(s)**; samples: `sshKeys_update`[ssh_key_identifier], `sshKeys_delete`[ssh_key_identifier], `apps_update`[id], `apps_delete`[id], `apps_restart`[app_id]...
- **discord** — **320 occurrence(s)**; samples: `get_application`[application_id], `update_application`[application_id], `applications_get_activity_instance`[application_id], `applications_get_activity_instance`[instance_id], `upload_application_attachment`[application_id]...
- **github** — **2094 occurrence(s)**; samples: `security_advisories_get_global_advisory`[ghsa_id], `apps_get_webhook_delivery`[delivery_id], `apps_redeliver_webhook_delivery`[delivery_id], `apps_get_installation`[installation_id], `apps_delete_installation`[installation_id]...
- **mongodb** — **474 occurrence(s)**; samples: `deleteFederationSetting`[federationSettingsId], `listFederationSettingConnectedOrgConfigs`[federationSettingsId], `getFederationSettingConnectedOrgConfig`[federationSettingsId], `updateFederationSettingConnectedOrgConfig`[federationSettingsId], `removeFederationSettingConnectedOrgConfig`[federationSettingsId]...
- **notion** — **13 occurrence(s)**; samples: `retrieveABlock`[id], `updateABlock`[id], `deleteABlock`[id], `retrieveBlockChildren`[id], `appendBlockChildren`[id]...
- **pagerduty** — **434 occurrence(s)**; samples: `createEntityTypeByIdChangeTags`[entity_type], `createEntityTypeByIdChangeTags`[id], `getEntityTypeByIdTags`[entity_type], `getEntityTypeByIdTags`[id], `getAbility`[id]...
- **spotify** — **29 occurrence(s)**; samples: `get_an_album`[id], `get_an_albums_tracks`[id], `get_an_artist`[id], `get_an_artists_albums`[id], `get_an_artists_top_tracks`[id]...
- **trello** — **139 occurrence(s)**; samples: `get_actions_id`[id], `put_actions_id`[id], `delete_actions_id`[id], `get_actions_idaction_reactions`[idAction], `post_actions_idaction_reactions`[idAction]...
- **zoom** — **24 occurrence(s)**; samples: `accountBillingInvoices`[accountId], `getAccountBillingInvoice`[accountId], `getAccountBillingInvoice`[invoiceId], `accountPlanAddonCancel`[accountId], `getPlanUsage`[accountId]...

### [ERROR] INVALID_TOOL_NAMES — affects 6 premade(s)

- **box** — **12 occurrence(s)**; names: `get_files_id_metadata_enterprise_securityClassification_6VMVochwUWo`, `post_files_id_metadata_enterprise_securityClassification_6VMVochwUWo`, `put_files_id_metadata_enterprise_securityClassification_6VMVochwUWo`, `delete_files_id_metadata_enterprise_securityClassification_6VMVochwUWo`, `get_folders_id_metadata_enterprise_securityClassification_6VMVochwUWo`...
- **cloudflare** — **108 occurrence(s)**; names: `access_short_lived_certificate_c_as_get_a_short_lived_certificate_ca`, `access_short_lived_certificate_c_as_create_a_short_lived_certificate_ca`, `access_short_lived_certificate_c_as_delete_a_short_lived_certificate_ca`, `access_short_lived_certificate_c_as_list_short_lived_certificate_c_as`, `access_bookmark_applications___deprecated__list_bookmark_applications`...
- **github** — **25 occurrence(s)**; names: `actions_get_fork_pr_contributor_approval_permissions_organization`, `actions_set_fork_pr_contributor_approval_permissions_organization`, `actions_list_selected_repositories_enabled_github_actions_organization`, `actions_set_selected_repositories_enabled_github_actions_organization`, `actions_list_selected_repositories_self_hosted_runners_organization`...
- **gitlab** — **113 occurrence(s)**; names: `getApiV4GroupsIdPackagesDebianDists_distributionComponentDebianInstallerBinaryArchitecturePackages`, `getApiV4GroupsIdPackagesDebianDists_distributionComponentDebianInstallerBinaryArchitectureByHashSha256FileSha256`, `getApiV4GroupsIdPackagesDebianDists_distributionComponentSourceSources`, `getApiV4GroupsIdPackagesDebianDists_distributionComponentSourceByHashSha256FileSha256`, `getApiV4GroupsIdPackagesDebianDists_distributionComponentBinaryArchitecturePackages`...
- **stripe** — **5 occurrence(s)**; names: `DeleteCustomersCustomerSubscriptionsSubscriptionExposedIdDiscount`, `PostTestHelpersIssuingAuthorizationsAuthorizationFraudChallengesRespond`, `PostTestHelpersIssuingPersonalizationDesignsPersonalizationDesignActivate`, `PostTestHelpersIssuingPersonalizationDesignsPersonalizationDesignDeactivate`, `PostTestHelpersIssuingPersonalizationDesignsPersonalizationDesignReject`
- **vercel** — **6 occurrence(s)**; names: `createInstallationsByIntegrationConfigurationIdResourcesByResourceIdExperimentationItems`, `updateInstallationsByIntegrationConfigurationIdResourcesByResourceIdExperimentationItemsByItemId`, `deleteInstallationsByIntegrationConfigurationIdResourcesByResourceIdExperimentationItemsByItemId`, `getInstallationsByIntegrationConfigurationIdResourcesByResourceIdExperimentationEdgeConfig`, `replaceInstallationsByIntegrationConfigurationIdResourcesByResourceIdExperimentationEdgeConfig`...

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
- **box** — **14 occurrence(s)**; samples: `put_files_id_metadata_enterprise_securityClassification_6VMVochwUWo` (PUT), `post_files_id_metadata_id_id` (POST), `put_files_id_metadata_id_id` (PUT), `put_files_id_metadata_global_boxSkillsCards` (PUT), `put_folders_id_metadata_enterprise_securityClassification_6VMVochwUWo` (PUT)...
- **circleci** — **4 occurrence(s)**; samples: `cancelJobByJobID` (POST), `cancelJobByJobNumber` (POST), `approvePendingApprovalJobById` (POST), `cancelWorkflow` (POST)
- **cloudflare** — **230 occurrence(s)**; samples: `mcp_portals_api_sync_server` (POST), `access_short_lived_certificate_c_as_create_a_short_lived_certificate_ca` (POST), `access_policies_convert_reusable` (PUT), `access_applications_revoke_service_tokens` (POST), `access_bookmark_applications___deprecated__create_a_bookmark_application` (POST)...
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
| algolia | 78 | api_key_header | 0 | 4 | 48 | 1 | 1 |
| asana | 167 | oauth2_auth_code | 0 | 2 | 138 | 1 | 1 |
| box | 296 | oauth2_auth_code | 0 | 14 | 0 | 2 | 1 |
| circleci | 114 | api_key_header | 0 | 4 | 85 | 1 | 1 |
| cloudflare | 2844 | api_key_header | 0 | 230 | 338 | 3 | 1 |
| digitalocean | 599 | bearer_token | 0 | 11 | 329 | 2 | 1 |
| discord | 230 | api_key_header | 0 | 24 | 320 | 1 | 1 |
| figma | 47 | api_key_header | 0 | 0 | 0 | 1 | 0 |
| github | 1112 | (none) | 1112 | 2 | 2094 | 3 | 1 |
| gitlab | 1126 | api_key_header | 0 | 86 | 0 | 1 | 1 |
| gmail | 79 | oauth2_auth_code | 0 | 16 | 0 | 0 | 1 |
| google_maps | 10 | (none) | 10 | 0 | 0 | 0 | 0 |
| jira | 487 | oauth2_auth_code | 0 | 30 | 0 | 0 | 1 |
| linear | 5 | (none) | 5 | 0 | 0 | 0 | 0 |
| mongodb | 468 | oauth2_client_creds | 0 | 0 | 474 | 1 | 0 |
| newsapi | 3 | (none) | 3 | 0 | 0 | 0 | 0 |
| notion | 13 | (none) | 13 | 0 | 13 | 1 | 0 |
| open_meteo | 1 | (none) | 1 | 0 | 0 | 0 | 0 |
| openai | 28 | (none) | 28 | 6 | 0 | 0 | 1 |
| openweathermap | 9 | (none) | 9 | 0 | 0 | 0 | 0 |
| pagerduty | 419 | api_key_header | 0 | 0 | 434 | 1 | 0 |
| perplexity | 1 | (none) | 1 | 0 | 0 | 0 | 0 |
| postmark | 23 | (none) | 23 | 0 | 0 | 0 | 0 |
| reddit | 17 | (none) | 17 | 0 | 0 | 0 | 0 |
| sendgrid | 19 | (none) | 19 | 0 | 0 | 0 | 0 |
| slack | 174 | oauth2_auth_code | 0 | 0 | 0 | 0 | 0 |
| spotify | 96 | oauth2_auth_code | 0 | 11 | 29 | 2 | 1 |
| stripe | 587 | basic_auth | 0 | 1 | 0 | 1 | 1 |
| supabase | 161 | bearer_token | 0 | 18 | 0 | 0 | 2 |
| tmdb | 27 | (none) | 27 | 0 | 0 | 0 | 0 |
| todoist | 19 | (none) | 19 | 2 | 0 | 0 | 1 |
| trello | 256 | api_key_query | 0 | 85 | 139 | 1 | 1 |
| twilio | 197 | basic_auth | 0 | 0 | 0 | 0 | 0 |
| twitter | 5 | (none) | 5 | 0 | 0 | 0 | 0 |
| unsplash | 15 | (none) | 15 | 0 | 0 | 0 | 0 |
| vercel | 322 | bearer_token | 0 | 19 | 0 | 1 | 1 |
| wolfram_alpha | 3 | (none) | 3 | 0 | 0 | 0 | 0 |
| youtube | 76 | oauth2_auth_code | 0 | 12 | 0 | 0 | 1 |
| zoom | 373 | api_key_header | 0 | 9 | 24 | 1 | 1 |
