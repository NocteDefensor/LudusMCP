# Changelog

## [1.0.24] - 2025-08-16

### Documentation

- Added update instructions to README for both NPM global and local development installs
- Added changelog documentation

## [1.0.23] - 2025-08-16

### Bug Fixes

- Fixed `insert_creds_range_config` help parameter functionality
- Fixed path resolution bug in `insert_creds_range_config` - relative paths now correctly resolve to `range-config-templates` directory
- Fixed credential injection not saving files - credentials are now actually written to disk
- Fixed `get_credential_from_user` help parameter functionality
- Fixed server-side help mode handling for both tools

### Changes

- Removed `validateOnly` parameter from `insert_creds_range_config` (breaking change)
- Tool now always injects credentials and saves files
- Made `credName` optional in `get_credential_from_user` when using help mode
- Made `configPath` and `credentialMappings` optional in `insert_creds_range_config` when using help mode
- Updated tool descriptions with better usage examples
- Added installation command examples to role collection schemas

### Breaking Changes

- `insert_creds_range_config`: Removed `validateOnly` parameter. Tool now always saves files after credential injection.

### Migration

If using `validateOnly: true`, make a copy of your config file before injection:
- Before: `{ "configPath": "...", "credentialMappings": {...}, "validateOnly": true }`
- After: `{ "configPath": "...", "credentialMappings": {...} }`

## [1.0.18] - Previous Release

- Base functionality for Ludus MCP server
- Core tools for range management, credential handling, and configuration
