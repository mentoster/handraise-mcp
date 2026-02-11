## ADDED Requirements

### Requirement: Human approval gate for MCP tools
The system SHALL be able to require explicit human approval before executing configured MCP tool invocations.

#### Scenario: Tool requires approval and is approved
- **WHEN** an agent attempts to invoke an MCP tool that is configured to require approval
- **THEN** execution SHALL pause and request a human decision

#### Scenario: Tool requires approval and is denied
- **WHEN** an agent attempts to invoke an MCP tool that is configured to require approval
- **THEN** a human SHALL be able to deny the request and the tool invocation SHALL NOT be executed

### Requirement: Approval request includes reviewable context
When requesting approval, the system SHALL provide a stable payload that allows a human to understand what will happen.

#### Scenario: Approval request payload fields are present
- **WHEN** the system requests approval for an MCP tool invocation
- **THEN** the request SHALL include the tool name, the input arguments (or redacted form), and a human-readable summary

### Requirement: Configurable approval policy
The system SHALL support configuration that determines which MCP tools require approval.

#### Scenario: Per-tool policy requires approval
- **WHEN** approval policy marks a specific tool as requiring approval
- **THEN** invocations of that tool SHALL require approval

#### Scenario: Allowlisted tool does not require approval
- **WHEN** approval policy allowlists a tool
- **THEN** invocations of that tool SHALL NOT require approval

### Requirement: Decisions are observable
The system SHALL record approval decisions in a way that can be used for auditing and debugging.

#### Scenario: Approval decision is recorded
- **WHEN** a human approves or denies a tool invocation
- **THEN** the system SHALL emit a structured log/transcript entry containing the decision and the tool identity
