import { z } from 'zod';

// Schema for prompt arguments
const CreateLudusRangeArgsSchema = z.object({
  requirements: z.string().describe('What you want to build'),
  roles: z.string().optional().describe('Optional desired Ludus roles/collections'),
  save_config: z.boolean().optional().default(false)
});

export type CreateLudusRangeArgs = z.infer<typeof CreateLudusRangeArgsSchema>;

export async function handleCreateLudusRangePrompt(args: CreateLudusRangeArgs) {
  const { requirements, roles, save_config = false } = args;

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Create a Ludus cyber range with these requirements: ${requirements}
${roles ? `\nUser-specified roles to consider: ${roles}` : ''}

COMPLETE WORKFLOW INSTRUCTIONS:
Execute the following steps in order. Maintain security throughout by redacting external credentials.

STEP 1: UNDERSTAND & CLARIFY
- Analyze the user requirements: "${requirements}"
${roles ? `- Consider user-specified roles: "${roles}"` : ''}
- Extract ALL specific components from natural language:
  * Number and types of VMs (workstations, servers, domain controllers)
  * Software/services needed (AD, SCCM, Elastic, monitoring tools)
  * Network requirements (Tailscale, VLANs, subnets)
  * Security tools (EDR, SIEM, logging)
  * Operating systems and templates
- If requirements are vague or missing critical details, ask clarifying questions
- Determine complexity level automatically based on component count and integration needs
${roles ? '- Validate user-specified roles exist and match requirements' : ''}
- Note save preference: ${save_config}

STEP 2: RESEARCH PHASE (Use tools in this order)
1. ludus_read_role_collection_schema - Get comprehensive role data and variables
2. ludus_read_range_config_schema - Understand YAML structure and validation rules  
3. ludus_roles_docs_read - Get complete roles documentation
4. ludus_networking_docs_read - Get networking configuration info
5. list_range_configs - Discover base templates in ~/.ludus-mcp/range-config-templates/base-configs/
6. read_range_config - Examine 1-3 relevant base templates for patterns
7. ludus_environment_guides_search - Get environment-specific guidance if needed

EXTERNAL ROLE HANDLING:
- If requirements not covered by official Ludus roles: ASK USER with options:
  a) Search internet for community/third-party solutions
  b) Provide alternative approaches using available roles
  c) Simplify requirements to use available roles
- MUST ask user permission before including any non-official Ludus roles found via web search
- Wait for user decision before proceeding with external roles

STEP 3: BUILD RANGE CONFIG
- Design complete VM architecture using research data
- Generate Ludus YAML configuration meeting all requirements
${roles ? `- PRIORITIZE user-specified roles: "${roles}" where applicable` : ''}
- **CRITICAL:** Use ONLY validated role variables from ludus_read_role_collection_schema
- **CRITICAL:** Follow exact YAML structure from ludus_read_range_config_schema  
- Ensure proper role variables using schema data - NO guessing or assumptions
- Apply correct credential handling:
  * EXTERNAL service credentials: Use {{LudusCredName-<user>-<credName>}} placeholders
  * RANGE-INTERNAL credentials: Include directly (AD passwords, SCCM passwords, domain accounts)
- SECURITY: When showing config content, REDACT any external service credentials
- **VALIDATION PREVIEW:** Double-check your config against both schemas BEFORE proceeding to validation

DETAILED CREDENTIAL GUIDANCE:
EXTERNAL SERVICE CREDENTIALS (use {{LudusCredName-<user>-<credName>}} placeholders):
- Third-party API keys (Tailscale, cloud services, SaaS platforms)
- External service tokens (GitHub, Docker Hub, monitoring services)  
- Cloud provider credentials (AWS, Azure, GCP access keys)
- External database connection strings to hosted services

RANGE-INTERNAL CREDENTIALS (include directly in YAML config):
- Domain Administrator passwords: "ClientPushPassword": "P@ssw0rd123!"
- Active Directory passwords (Administrator, domain users, service accounts)
- SCCM passwords (SCCM service accounts, SQL service accounts for SCCM)
- Local Windows/Linux user account passwords within the range
- Database passwords for databases running INSIDE the range VMs
- Service account passwords for internal range services (IIS, Apache, domain services)
- Local application passwords (web apps, monitoring tools running on range VMs)

WHEN UNCERTAIN: Ask user "Is this credential for an external service or internal to the range?"

STEP 4: COMPREHENSIVE VALIDATION - MANDATORY SCHEMA VALIDATION
**CRITICAL:** Use BOTH schemas to validate BEFORE writing any configuration files

ROLE VARIABLES VALIDATION:
- MANDATORY: Run ludus_read_role_collection_schema to get complete role definitions
- Cross-check EVERY role and variable in your configuration against the schema
- Verify all required variables are present and correctly formatted
- Ensure variable types match schema specifications (string, boolean, array, etc.)
- Confirm default values are appropriate or properly customized

RANGE CONFIGURATION VALIDATION:
- MANDATORY: Run ludus_read_range_config_schema to validate YAML structure
- Verify your configuration follows proper Ludus range config format
- Check all required sections are present (ludus:, vm_name, template, etc.)
- Validate network configuration follows schema requirements
- Ensure domain configurations match schema patterns

COMPREHENSIVE VALIDATION:
- Run ludus_range_config_check_against_plan with:
  * user_requirements: "${requirements}"
  * roles_used: [list of roles used]
  * validated_variables_summary: [research summary from schemas/docs]
- Address ALL validation failures before proceeding
- DO NOT proceed to Step 5 until all schema validations pass

STEP 5: SYNTAX VALIDATION
- Run validate_range_config to check YAML syntax and structure
- Fix any validation errors found
- Confirm configuration is deployment-ready
- FINAL CHECK: Re-verify role variables against ludus_read_role_collection_schema

STEP 6: SAVE & NEXT STEPS
- Only after ALL validations pass: Use write_range_config to save configuration
- Provide clear next steps for user:
  * Configuration summary
  * Deployment instructions (set_range_config, then deploy_range)
  * Any credential requirements identified
- Ask user for additional instructions

CRITICAL USER PERMISSIONS:
- MUST ask user permission before using set_range_config (specify target user)
- MUST ask user permission before injecting credentials with insert_creds_range_config
- DON'T automatically deploy ranges - only when user explicitly confirms
- DON'T automatically set range configs - only when user explicitly requests

SECURITY REQUIREMENTS:
- NEVER display external service credentials (API keys, SaaS tokens) in responses
- REDACT with "REDACTED-CREDENTIAL" when showing configs
- Range-internal passwords (AD, SCCM, domain accounts) can be shown directly
- When uncertain about credential type, ask user

COMPLETION CRITERIA:
- All user requirements met
- Configuration validates successfully
- Role variables verified against schema
- Security guidelines followed
- Clear next steps provided`
        }
      }
    ]
  };
} 