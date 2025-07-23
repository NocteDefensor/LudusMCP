import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';

export interface RangePlanRequest {
  user_intent: string;              // "I need AD with SCCM and elastic monitoring on 3 workstations"
  roles?: string;                   // Optional: "ludus_sccm, ludus_elastic_agent, ludus_tailscale"
  environment_type?: string;        // Default: 'active_directory'
  special_requirements?: string[];
  user_context?: string;            // For file organization/naming
  output_file?: string;             // Optional: where to save
  preview_mode?: boolean;           // Just show plan, don't create files
  include_testing?: boolean;        // Add testing/validation VMs
}

export interface RangePlanResponse {
  success: boolean;
  plan_id: string;                  // Unique identifier for this planning session
  instructions: RangePlanInstructions;
  estimated_vms: number;            // Rough estimate of VM count
  message: string;
}

interface RangePlanInstructions {
  task: "ludus_range_planning";
  user_intent: string;
  plan_metadata: {
    plan_id: string;
    created: string;
    roles?: string;
    environment_type: string;
    preview_mode: boolean;
  };
  
  research_phase: {
    step1_analyze_intent: {
      action: "parse_user_requirements";
      description: "Break down user_intent into specific components";
      process: [
        "Parse VM counts from natural language (e.g., '3 workstations', 'one file server')",
        "Extract specific software/roles mentioned (SCCM, Elastic, Tailscale, etc.)", 
        "Identify user-specified Ludus roles if provided",
        "Determine network topology requirements",
        "Identify any compliance/security requirements",
        "Note any integration requirements",
        "Assess complexity level based on component count and integrations"
      ];
      output: "List of required components, VM counts, roles, and their purposes";
    };
    
    step2_clarify_requirements: {
      action: "ask_clarifying_questions";
      description: "If user_intent is unclear, vague, or missing key details, ask follow-up questions";
      triggers: [
        "Vague language like 'basic setup' or 'standard environment'",
        "Missing critical details (OS versions, specific software versions)",
        "Ambiguous requirements (unclear integration needs)",
        "Conflicting requirements or impossible combinations",
        "Unusual or non-standard requests needing clarification"
      ];
      question_categories: {
        infrastructure: [
          "What operating system versions do you need? (Windows Server 2019/2022, Ubuntu 20.04/22.04, etc.)",
          "How many domain controllers do you need?",
          "Do you need multiple domains or forests?",
          "What network topology are you simulating? (flat, segmented, DMZ, etc.)"
        ];
        software_specifics: [
          "What version of [SOFTWARE] do you need?",
          "Do you need [SOFTWARE] in high availability configuration?", 
          "Are there specific integrations required between systems?",
          "Do you need production-like or minimal configurations?"
        ];
        credentials_and_access: [
          "Do you need integration with external services (cloud APIs, SaaS platforms)?",
          "Will any services need API keys or tokens for external systems?",
          "What should the domain administrator password be?",
          "Do you need specific service account credentials configured?"
        ],
        scale_and_resources: [
          "How many users will this simulate? (affects AD population)",
          "What's the expected load/usage pattern?",
          "Do you have specific VM resource constraints?",
          "Is this for testing, training, or production simulation?"
        ];
        special_requirements: [
          "Do you need internet access for VMs?",
          "Are there compliance requirements (NIST, SOC2, etc.)?",
          "Do you need logging/monitoring for specific events?",
          "Are there any security tools or controls to include?"
        ]
      };
      process: [
        "Identify unclear or missing aspects of the user_intent",
        "Generate 2-4 specific, actionable questions",
        "Present questions in a clear, organized format",
        "Wait for user responses before proceeding to research",
        "Update the user_intent based on clarifications received"
      ];
      skip_if: "User intent is clear and complete with all necessary details";
      output: "Updated user_intent with clarified requirements, or request to user for more information";
    };
    
    step3_research_components: {
      action: "research_ludus_capabilities_with_schemas",
      description: "Research using available schemas and documentation tools",
      required_searches: [
        "FIRST: Use ludus_read_role_collection_schema tool to get comprehensive role data",
        "SECOND: Use ludus_read_range_config_schema for YAML structure, properties, and validation rules",
        "THIRD: Use ludus_roles_docs_read for complete roles documentation",
        "FOURTH: Use ludus_networking_docs_read for networking configuration options",
        "FIFTH: Use list_range_configs to discover available base templates in ~/.ludus-mcp/range-config-templates/base-configs/",
        "SIXTH: Use read_range_config to examine relevant base templates that match user requirements",
        "SEVENTH: Use ludus_environment_guides_search for environment guides and deployment patterns"
      ],
      critical_advantage: "Start with pre-validated schemas, then examine existing templates for patterns before environment guides",
      tool_usage: "Use schema tools first for verified data, then examine existing templates for proven configurations",
      workflow: [
        "Use ludus_read_role_collection_schema to get complete role inventory and variables",
        "Use ludus_read_range_config_schema to understand YAML structure and validation requirements", 
        "Use ludus_roles_docs_read to get complete roles documentation",
        "Use ludus_networking_docs_read for network topology requirements",
        "Use list_range_configs to discover available base templates (basic-ad-network.yml, adcs-lab.yml, sccm-lab.yml, etc.)",
        "Use read_range_config to examine 1-3 most relevant base templates for structure and patterns",
        "Map user requirements to available roles using schema search functions",
        "Use ludus_environment_guides_search for deployment patterns and examples",
        "Use ludus_docs_search only for missing information not covered by schemas or templates"
      ],
      output: "Complete mapping of requirements to available roles and configuration structure with template examples"
    },
    
    step4_handle_missing_roles: {
      action: "handle_roles_not_in_schema_or_docs",
      description: "Address requirements not covered by schema or official docs",
      process: [
        "Identify specific functionality that has no schema or docs coverage",
        "Present clear options to user:",
        "  a) Search internet for community/third-party solutions",
        "  b) Provide additional information or alternative approaches",
        "  c) Simplify requirements to use available roles",
        "Wait for user decision before proceeding",
        "If user approves internet search, research external roles but MUST ask permission to include",
        "If user provides additional info, incorporate into requirements",
        "If user chooses simplification, adjust requirements accordingly"
      ],
      skip_if: "All requirements covered by schema + official docs",
      user_interaction: "Required when gaps exist - present options and wait for decision",
      output: "Complete role coverage plan with user-approved approach for all requirements"
    },

    step5_validate_role_variables: {
      action: "validate_role_variables_comprehensive",
      description: "Ensure all role variables are properly documented for config generation",
      process: [
        "FOR SCHEMA ROLES: Variables already validated - use schema data directly",
        "FOR NEW/EXTERNAL ROLES: Research GitHub repositories if user approved external roles",
        "Extract variables from README.md, defaults/main.yml, vars/main.yml, tasks/main.yml",
        "Document ALL required and optional variables with types and defaults",
        "Validate completeness - no missing critical variables"
      ],
      critical_advantage: "Most roles skip GitHub research - use verified schema variables",
      blocking_requirement: "All roles must have complete variable documentation before step 6",
      output: "Complete role variable documentation (schema-based + any additional research)"
    }
  };
  
  design_phase: {
    step6_design_architecture: {
      action: "design_range_architecture",
      description: "Design the complete range architecture and VM layout",
      process: [
        "Create VM layout based on user requirements and role needs",
        "Design network topology and connectivity", 
        "Allocate appropriate resources (CPU, RAM) per VM",
        "Plan role distribution across VMs",
        "Consider dependencies between roles and VMs",
        "Design security boundaries and access patterns"
      ],
      inputs: "Researched roles, environment patterns, and user requirements",
      output: "Architecture design with VM specifications and role mapping"
    },
    
    step7_generate_config: {
      action: "generate_ludus_yaml_configuration",
      description: "Generate the complete Ludus YAML configuration",
      process: [
        "Use validated role variables from our comprehensive schema for all covered roles",
        "Apply any newly researched role variables for uncovered requirements",
        "Set appropriate VM specifications based on complexity level", 
        "Configure networking and connectivity requirements",
        "Add all required and optional role variables with proper values from schema",
        "Include user-specific customizations and special requirements",
        "Add proper metadata and documentation comments"
      ],
      critical_advantage: "Using pre-validated schema variables eliminates variable research guesswork",
      data_sources: "Comprehensive schema (83% coverage) + minimal additional research (17%)",
      output: "Complete, valid Ludus YAML configuration with verified role variables"
    },

    step8_qa_check_against_plan: {
      action: "comprehensive_validation_check",
      description: "MANDATORY: Verify configuration meets user requirements and validate all components",
      process: [
        "Use ludus_range_config_check_against_plan tool with:",
        "  - Original user requirements from step 1",
        "  - Generated YAML configuration from step 7",
        "  - List of all roles used",
        "  - Summary of validated variables from step 5",
        "Review user requirements coverage:",
        "  - Verify each requirement is addressed by specific role or configuration",
        "  - Check for any missed functionality or components",
        "  - Ensure role dependencies are properly handled",
        "  - Confirm VM specifications support all selected roles",
        "Validate role and variable correctness:",
        "  - Mark each checklist item as PASS or FAIL with explanation",
        "  - Verify role/collections and role_vars are correct",
        "  - Identify any gaps, missing components, or incorrect variables",
        "  - Address all identified issues before proceeding"
      ],
      critical_requirements: [
        "ALL user requirements must be met",
        "ALL checklist items must pass before proceeding",
        "Any failures MUST be addressed and re-checked",
        "Cannot proceed to validation with unresolved issues"
      ],
      blocking_requirement: "Must achieve overall assessment of 'READY FOR VALIDATION'",
      output: "Comprehensive validation confirming configuration completeness, correctness, and requirement coverage"
    }
  };
  
  validation_phase: {
    step9_validate_config: {
      action: "validate_and_refine",
      description: "Validate configuration and make improvements",
      process: [
        "Use validate_range_config with content parameter to check syntax and logic",
        "Fix any validation errors found",
        "Optimize VM resource allocation",
        "Verify all role variables are properly set using step 5 validation results",
        "Check for any missing dependencies"
      ],
      critical_requirement: "All role variables must match the validated variables from step 5"
    },
    
    step10_save_and_document: {
      action: "save_configuration_and_request_next_steps",
      description: "Save config and ask user for next steps",
      process: [
        "If output_file specified, use write_range_config to save",
        "Provide the saved configuration file path to user",
        "Ask user what they would like to do next (deploy, modify, etc.)"
      ],
      skip_if: "preview_mode is true"
    }
  };
  
  parameters: RangePlanRequest;
  
  success_criteria: [
    "All components from user_intent are included",
    "Comprehensive catalog of ALL available Ludus roles was created",
    "Every user requirement is mapped to specific roles",
    "EVERY role has complete variable documentation from GitHub repositories",
    "All role variables are validated with source documentation (step 5 completed)",
    "Role variables are properly researched and configured using validated data",
    "User permission obtained for any external/non-official roles",
    "VM specifications match complexity level",
    "Configuration passes validation using validated role variables", 
    "Clear deployment instructions provided",
    "Resource requirements are reasonable"
  ];
  
  error_handling: {
    doc_search_fails: "Use existing ludus docs examples and common configurations";
    github_access_fails: "Fall back to role documentation in ludus docs";
    missing_ludus_roles: "Research external roles via web_search, but MUST ask user permission before including";
    external_role_declined: "Suggest alternative approaches, manual configuration steps, or simplified requirements";
    validation_fails: "Iterate and fix issues, provide explanation of changes";
    resource_constraints: "Suggest alternative configurations or VM count reduction";
  };
}

function estimateVmCount(intent: string): number {
  let estimatedVms = 1; // At minimum, likely need 1 server (e.g., domain controller)
  
  // Detect complexity indicators to suggest additional infrastructure needs
  const complexityIndicators = [
    'sccm', 'elasticsearch', 'elk', 'splunk', 'exchange', 'sql', 
    'mssql', 'adcs', 'certificate services', 'wazuh',
    'monitoring', 'multiple domains', 'forest',
    'secondary dc', 'child domain', 'database', 'web server',
    'application server', 'file server', 'print server'
  ];
  
  // Count unique service types mentioned (not specific server counts)
  const mentionedServices = complexityIndicators.filter(service => 
    intent.toLowerCase().includes(service)
  ).length;
  
  // Estimate additional VMs based on service complexity
  // More services = more potential infrastructure VMs needed
  if (mentionedServices > 0) {
    estimatedVms += Math.min(mentionedServices, 8); // Cap at reasonable estimate
  }
  
  return estimatedVms;
}

export function createLudusRangePlannerTool(logger: Logger): Tool {
  return {
    name: 'ludus_range_planner',
    description: `**LUDUS RANGE PLANNER** - Intelligent Ludus range configuration planning and research

**PURPOSE:**
Analyzes user requirements and generates structured instructions for creating Ludus cyber ranges. Parses natural language requests to extract VM counts, software requirements, and complexity levels.

**EXECUTION FLOW:**
1. **Requirements Analysis** - Parse natural language into specific components (VMs, software, roles)
2. **Research Phase** - Generate instructions to use schema tools, documentation, and templates
3. **Configuration Design** - Provide structured steps to build YAML configuration
4. **Validation Framework** - Include comprehensive validation and syntax checking steps
5. **Deployment Guidance** - Offer next steps for range activation and deployment

**WHEN TO USE:**
- User requests range creation with natural language ("I need AD with SCCM on 3 workstations")
- Complex multi-component environments requiring research and planning
- When requirements need clarification or are incomplete
- First-time users needing structured guidance

**OUTPUT:**
Returns detailed step-by-step instructions that guide the LLM through:
- Schema-based research (role collection schema, range config schema, templates)
- Configuration generation using discovered components
- Comprehensive validation against requirements and syntax
- Security-aware credential handling guidance
- User permission protocols for deployment actions

**IMPORTANT:**
- This tool generates INSTRUCTIONS, not configurations
- Instructions must be followed using existing MCP tools
- Always validate configurations before deployment
- Includes built-in credential security guidance`,

    inputSchema: {
      type: 'object',
      properties: {
        user_intent: {
          type: 'string',
          description: 'Natural language description of what you want to build. Include VM counts, software, and requirements. Examples: "I need AD with SCCM and elastic monitoring on 3 workstations", "Create a Windows domain with 2 workstations for testing", "Build a red team lab environment with 5 VMs"'
        },
        roles: {
          type: 'string',
          description: 'Optional: Specify desired Ludus roles/collections to use (e.g., "ludus_sccm, ludus_elastic_agent, ludus_tailscale")'
        },
        environment_type: {
          type: 'string',
          description: 'Primary environment type (default: active_directory)',
          default: 'active_directory'
        },
        special_requirements: {
          type: 'array',
          items: { type: 'string' },
          description: 'Any special requirements, constraints, or considerations'
        },
        user_context: {
          type: 'string',
          description: 'User context for file organization (e.g., "TestRange", "admin")'
        },
        output_file: {
          type: 'string',
          description: 'Optional: filename where to save the final configuration'
        },
        preview_mode: {
          type: 'boolean',
          description: 'If true, only plan and preview - do not write config files (default: false)',
          default: false
        },
        include_testing: {
          type: 'boolean',
          description: 'Include testing/validation infrastructure (default: false)',
          default: false
        }
      },
      required: ['user_intent']
    }
  };
}

export async function handleLudusRangePlanner(
  args: RangePlanRequest,
  logger: Logger
): Promise<RangePlanResponse> {
  const planId = `plan-${Date.now()}`;
  
  // Set defaults for optional parameters only
  const params = {
    environment_type: 'active_directory',
    special_requirements: [],
    user_context: '',
    output_file: '',
    preview_mode: false,
    include_testing: false,
    ...args
  } as Required<RangePlanRequest>;
  
  logger.info('Creating range plan', { 
    planId, 
    userIntent: params.user_intent,
    roles: params.roles,
    environmentType: params.environment_type
  });
  
  // Estimate VM count based on natural language parsing
  const estimatedVms = estimateVmCount(params.user_intent);
  
  const instructions: RangePlanInstructions = {
    task: "ludus_range_planning",
    user_intent: params.user_intent,
    plan_metadata: {
      plan_id: planId,
      created: new Date().toISOString(),
      roles: params.roles,
      environment_type: params.environment_type,
      preview_mode: params.preview_mode
    },
    research_phase: {
      step1_analyze_intent: {
        action: "parse_user_requirements",
        description: "Break down user_intent into specific components",
        process: [
          "Parse VM counts from natural language (e.g., '3 workstations', 'one file server')",
          "Extract specific software/roles mentioned (SCCM, Elastic, Tailscale, etc.)", 
          "Identify user-specified Ludus roles if provided",
          "Determine network topology requirements",
          "Identify any compliance/security requirements",
          "Note any integration requirements",
          "Assess complexity level based on component count and integrations"
        ],
        output: "List of required components, VM counts, roles, and their purposes"
      },
      step2_clarify_requirements: {
        action: "ask_clarifying_questions",
        description: "If user_intent is unclear, vague, or missing key details, ask follow-up questions",
        triggers: [
          "Vague language like 'basic setup' or 'standard environment'",
          "Missing critical details (OS versions, specific software versions)",
          "Ambiguous requirements (unclear integration needs)",
          "Conflicting requirements or impossible combinations",
          "Unusual or non-standard requests needing clarification"
        ],
        question_categories: {
          infrastructure: [
            "What operating system versions do you need? (Windows Server 2019/2022, Ubuntu 20.04/22.04, etc.)",
            "How many domain controllers do you need?",
            "Do you need multiple domains or forests?",
            "What network topology are you simulating? (flat, segmented, DMZ, etc.)"
          ],
          software_specifics: [
            "What version of [SOFTWARE] do you need?",
            "Do you need [SOFTWARE] in high availability configuration?", 
            "Are there specific integrations required between systems?",
            "Do you need production-like or minimal configurations?"
          ],
          credentials_and_access: [
            "Do you need integration with external services (cloud APIs, SaaS platforms)?",
            "Will any services need API keys or tokens for external systems?",
            "What should the domain administrator password be?",
            "Do you need specific service account credentials configured?"
          ],
          scale_and_resources: [
            "How many users will this simulate? (affects AD population)",
            "What's the expected load/usage pattern?",
            "Do you have specific VM resource constraints?",
            "Is this for testing, training, or production simulation?"
          ],
          special_requirements: [
            "Do you need internet access for VMs?",
            "Are there compliance requirements (NIST, SOC2, etc.)?",
            "Do you need logging/monitoring for specific events?",
            "Are there any security tools or controls to include?"
          ]
        },
        process: [
          "Identify unclear or missing aspects of the user_intent",
          "Generate 2-4 specific, actionable questions",
          "Present questions in a clear, organized format",
          "Wait for user responses before proceeding to research",
          "Update the user_intent based on clarifications received"
        ],
        skip_if: "User intent is clear and complete with all necessary details",
        output: "Updated user_intent with clarified requirements, or request to user for more information"
      },
      step3_research_components: {
        action: "research_ludus_capabilities_with_schemas",
        description: "Research using available schemas and documentation tools",
        required_searches: [
          "FIRST: Use ludus_read_role_collection_schema tool to get comprehensive role data",
          "SECOND: Use ludus_read_range_config_schema for YAML structure, properties, and validation rules",
          "THIRD: Use ludus_roles_docs_read for complete roles documentation",
          "FOURTH: Use ludus_networking_docs_read for networking configuration options",
          "FIFTH: Use list_range_configs to discover available base templates in ~/.ludus-mcp/range-config-templates/base-configs/",
          "SIXTH: Use read_range_config to examine relevant base templates that match user requirements",
          "SEVENTH: Use ludus_environment_guides_search for environment guides and deployment patterns"
        ],
        critical_advantage: "Start with pre-validated schemas, then examine existing templates for patterns before environment guides",
        tool_usage: "Use schema tools first for verified data, then examine existing templates for proven configurations",
        workflow: [
          "Use ludus_read_role_collection_schema to get complete role inventory and variables",
          "Use ludus_read_range_config_schema to understand YAML structure and validation requirements", 
          "Use ludus_roles_docs_read to get complete roles documentation",
          "Use ludus_networking_docs_read for network topology requirements",
          "Use list_range_configs to discover available base templates (basic-ad-network.yml, adcs-lab.yml, sccm-lab.yml, etc.)",
          "Use read_range_config to examine 1-3 most relevant base templates for structure and patterns",
          "Map user requirements to available roles using schema search functions",
          "Use ludus_environment_guides_search for deployment patterns and examples",
          "Use ludus_docs_search only for missing information not covered by schemas or templates"
        ],
        output: "Complete mapping of requirements to available roles and configuration structure with template examples"
      },
      
      step4_handle_missing_roles: {
        action: "handle_roles_not_in_schema_or_docs",
        description: "Address requirements not covered by schema or official docs",
        process: [
          "Identify specific functionality that has no schema or docs coverage",
          "Present clear options to user:",
          "  a) Search internet for community/third-party solutions",
          "  b) Provide additional information or alternative approaches",
          "  c) Simplify requirements to use available roles",
          "Wait for user decision before proceeding",
          "If user approves internet search, research external roles but MUST ask permission to include",
          "If user provides additional info, incorporate into requirements",
          "If user chooses simplification, adjust requirements accordingly"
        ],
        skip_if: "All requirements covered by schema + official docs",
        user_interaction: "Required when gaps exist - present options and wait for decision",
        output: "Complete role coverage plan with user-approved approach for all requirements"
      },

      step5_validate_role_variables: {
        action: "validate_role_variables_comprehensive",
        description: "Ensure all role variables are properly documented for config generation",
        process: [
          "FOR SCHEMA ROLES: Variables already validated - use schema data directly",
          "FOR NEW/EXTERNAL ROLES: Research GitHub repositories if user approved external roles",
          "Extract variables from README.md, defaults/main.yml, vars/main.yml, tasks/main.yml",
          "Document ALL required and optional variables with types and defaults",
          "Validate completeness - no missing critical variables"
        ],
        critical_advantage: "Most roles skip GitHub research - use verified schema variables",
        blocking_requirement: "All roles must have complete variable documentation before step 6",
        output: "Complete role variable documentation (schema-based + any additional research)"
      }
    },
    design_phase: {
      step6_design_architecture: {
        action: "design_range_architecture",
        description: "Design the complete range architecture and VM layout",
        process: [
          "Create VM layout based on user requirements and role needs",
          "Design network topology and connectivity", 
          "Allocate appropriate resources (CPU, RAM) per VM",
          "Plan role distribution across VMs",
          "Consider dependencies between roles and VMs",
          "Design security boundaries and access patterns"
        ],
        inputs: "Researched roles, environment patterns, and user requirements",
        output: "Architecture design with VM specifications and role mapping"
      },
      
      step7_generate_config: {
        action: "generate_ludus_yaml_configuration",
        description: "Generate the complete Ludus YAML configuration",
        process: [
          "Use validated role variables from our comprehensive schema for all covered roles",
          "Apply any newly researched role variables for uncovered requirements",
          "Set appropriate VM specifications based on complexity level", 
          "Configure networking and connectivity requirements",
          "Add all required and optional role variables with proper values from schema",
          "Include user-specific customizations and special requirements",
          "Add proper metadata and documentation comments"
        ],
        critical_advantage: "Using pre-validated schema variables eliminates variable research guesswork",
        data_sources: "Comprehensive schema (83% coverage) + minimal additional research (17%)",
        output: "Complete, valid Ludus YAML configuration with verified role variables"
      },

      step8_qa_check_against_plan: {
        action: "comprehensive_validation_check",
        description: "MANDATORY: Verify configuration meets user requirements and validate all components",
        process: [
          "Use ludus_range_config_check_against_plan tool with:",
          "  - Original user requirements from step 1",
          "  - Generated YAML configuration from step 7",
          "  - List of all roles used",
          "  - Summary of validated variables from step 5",
          "Review user requirements coverage:",
          "  - Verify each requirement is addressed by specific role or configuration",
          "  - Check for any missed functionality or components",
          "  - Ensure role dependencies are properly handled",
          "  - Confirm VM specifications support all selected roles",
          "Validate role and variable correctness:",
          "  - Mark each checklist item as PASS or FAIL with explanation",
          "  - Verify role/collections and role_vars are correct",
          "  - Identify any gaps, missing components, or incorrect variables",
          "  - Address all identified issues before proceeding"
        ],
        critical_requirements: [
          "ALL user requirements must be met",
          "ALL checklist items must pass before proceeding",
          "Any failures MUST be addressed and re-checked",
          "Cannot proceed to validation with unresolved issues"
        ],
        blocking_requirement: "Must achieve overall assessment of 'READY FOR VALIDATION'",
        output: "Comprehensive validation confirming configuration completeness, correctness, and requirement coverage"
      }
    },
    validation_phase: {
      step9_validate_config: {
        action: "validate_and_refine",
        description: "Validate configuration and make improvements",
        process: [
          "Use validate_range_config with content parameter to check syntax and logic",
          "Fix any validation errors found",
          "Optimize VM resource allocation",
          "Verify all role variables are properly set using step 5 validation results",
          "Check for any missing dependencies"
        ],
        critical_requirement: "All role variables must match the validated variables from step 5"
      },
      
      step10_save_and_document: {
        action: "save_configuration_and_request_next_steps",
        description: "Save config and ask user for next steps",
        process: [
          "If output_file specified, use write_range_config to save",
          "Provide the saved configuration file path to user",
          "Ask user what they would like to do next (deploy, modify, etc.)"
        ],
        skip_if: "preview_mode is true"
      }
    },
    parameters: params,
    success_criteria: [
      "All components from user_intent are included",
      "Comprehensive catalog of ALL available Ludus roles was created",
      "Every user requirement is mapped to specific roles",
      "EVERY role has complete variable documentation from GitHub repositories",
      "All role variables are validated with source documentation (step 5 completed)",
      "Role variables are properly researched and configured using validated data",
      "User permission obtained for any external/non-official roles",
      "VM specifications match complexity level",
      "Configuration passes validation using validated role variables", 
      "Clear deployment instructions provided",
      "Resource requirements are reasonable"
    ],
    error_handling: {
      doc_search_fails: "Use existing ludus docs examples and common configurations",
      github_access_fails: "Fall back to role documentation in ludus docs",
      missing_ludus_roles: "Research external roles via web_search, but MUST ask user permission before including",
      external_role_declined: "Suggest alternative approaches, manual configuration steps, or simplified requirements",
      validation_fails: "Iterate and fix issues, provide explanation of changes",
      resource_constraints: "Suggest alternative configurations or VM count reduction"
    }
  };
  
  return {
    success: true,
    plan_id: planId,
    instructions,
    estimated_vms: estimatedVms,
    message: `Range planning initiated (${planId}). Follow the structured workflow below exactly as specified in the create-ludus-range prompt.

**EXECUTE PROMPT WORKFLOW:**
Use the create-ludus-range MCP prompt for the complete 6-step workflow. This tool provides the research framework - the prompt provides the execution guidance.

**IF NOT USING PROMPT, FOLLOW THESE STEPS:**

STEP 1: UNDERSTAND & CLARIFY
- Analyze user requirements and extract specific components
- Ask clarifying questions if requirements are vague
- Determine complexity automatically from component count

STEP 2: RESEARCH PHASE (Use tools in this exact order)
1. ludus_read_role_collection_schema - Get comprehensive role data
2. ludus_read_range_config_schema - Understand YAML structure
3. ludus_roles_docs_read - Get complete roles documentation
4. ludus_networking_docs_read - Get networking configuration info
5. list_range_configs - Discover base templates in ~/.ludus-mcp/range-config-templates/base-configs/
6. read_range_config - Examine 1-3 relevant base templates
7. ludus_environment_guides_search - Get environment-specific guidance if needed

STEP 3: BUILD RANGE CONFIG
- Design complete VM architecture using research data
- Generate Ludus YAML configuration meeting all requirements
- Ensure proper role variables using schema data
- Apply correct credential handling (external vs internal)

STEP 4: COMPREHENSIVE VALIDATION
- Run ludus_range_config_check_against_plan with user requirements and roles used
- MANDATORY: Run ludus_read_role_collection_schema to verify all role variables
- Cross-check every role and variable against schema

STEP 5: SYNTAX VALIDATION
- Run validate_range_config to check YAML syntax and structure
- Fix any validation errors found

STEP 6: SAVE & NEXT STEPS
- Use write_range_config to save configuration if requested
- Provide clear next steps (set_range_config, then deploy_range)
- Ask user for additional instructions

**CRITICAL REMINDERS:**
- ASK USER permission before using set_range_config (specify target user)
- ASK USER permission before injecting credentials
- NEVER display external service credentials in responses
- Range-internal passwords (AD, SCCM, domain accounts) can be shown directly

**RECOMMENDED:** Use the create-ludus-range MCP prompt for the complete guided experience.`
  };
}