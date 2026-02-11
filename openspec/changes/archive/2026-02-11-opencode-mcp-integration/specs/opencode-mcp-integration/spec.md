## ADDED Requirements

### Requirement: Repository-local OpenCode MCP registration
The system SHALL provide a documented and valid repository-local OpenCode configuration pattern that registers this integration under the `mcp` section and can be resolved from this workspace.

#### Scenario: Local configuration includes MCP server registration
- **WHEN** a developer configures OpenCode for this repository
- **THEN** the configuration includes an `mcp` server entry with a concrete server name, transport type, and launch command that resolves from the repository path

### Requirement: Build output is usable by configured MCP command
The system SHALL define and verify a build-and-run contract where the configured MCP command references artifacts that exist after the standard project build workflow.

#### Scenario: Build produces configured executable target
- **WHEN** a developer runs the documented build command for this project
- **THEN** the output required by the MCP launch command exists at the documented path and is executable by the configured runtime command

### Requirement: Integration configuration supports secure environment injection
The system SHALL support environment variable wiring for MCP configuration without hardcoding secrets in repository configuration examples.

#### Scenario: Configuration uses environment placeholders
- **WHEN** integration examples require credentials or runtime options
- **THEN** configuration examples use environment placeholder patterns instead of literal secret values

### Requirement: Integration setup is verifiable from the repository workflow
The system SHALL provide verification steps that demonstrate OpenCode can load and use the configured MCP integration from this repository.

#### Scenario: Verification workflow confirms integration availability
- **WHEN** the developer follows the documented setup and verification steps
- **THEN** OpenCode resolves the MCP server configuration and exposes the integration tools for use in the session
