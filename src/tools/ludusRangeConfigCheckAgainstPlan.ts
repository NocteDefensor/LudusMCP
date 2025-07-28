import { z } from 'zod';
import { Logger } from '../utils/logger.js';
import { LudusCliWrapper } from '../ludusMCP/cliWrapper.js';

const LudusRangeConfigCheckSchema = z.object({
  user_requirements: z.string().describe('Original user requirements from step 1'),
  config_content: z.string().describe('The generated Ludus YAML configuration to check'),
  roles_used: z.array(z.string()).describe('List of all roles used in the configuration'),
  validated_variables_summary: z.string().optional().describe('Summary of role variables that were validated from GitHub repos'),
});

export function createLudusRangeConfigCheckAgainstPlanTool(logger: Logger, ludusCliWrapper: LudusCliWrapper) {
  return {
    name: 'ludus_range_config_check_against_plan',
    description: `**RANGE CONFIG QUALITY ASSURANCE** - Comprehensive validation checklist

**PURPOSE:**
Provides a structured checklist to verify the generated range configuration meets all user requirements and includes all necessary components.

**VALIDATES:**
- User requirements coverage and completeness
- Role selection and variable configuration
- Architecture design and VM specifications
- Component integration and dependencies
- Missing functionality identification

**WORKFLOW POSITION:**
Use after generating the YAML configuration and before syntax validation (validate_range_config).

**OUTPUT:**
Returns a comprehensive checklist with PASS/FAIL items and an overall assessment of configuration readiness.`,
    inputSchema: {
      type: 'object',
      properties: {
        user_requirements: {
          type: 'string',
          description: 'Original user requirements from step 1'
        },
        config_content: {
          type: 'string',
          description: 'The generated Ludus YAML configuration to check'
        },
        roles_used: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of all roles used in the configuration'
        },
        validated_variables_summary: {
          type: 'string',
          description: 'Summary of role variables that were validated from GitHub repos'
        }
      },
      required: ['user_requirements', 'config_content', 'roles_used']
    },
  };
}

export async function handleLudusRangeConfigCheckAgainstPlan(
  args: z.infer<typeof LudusRangeConfigCheckSchema>,
  logger: Logger,
  ludusCliWrapper: LudusCliWrapper
): Promise<{ content: Array<{ type: string; text: string }> }> {
  logger.info('Range config QA check requested');

  const checklist = generateQAChecklist(args.user_requirements, args.config_content, args.roles_used, args.validated_variables_summary);

  return {
    content: [{
      type: 'text',
      text: checklist
    }]
  };
}

function generateQAChecklist(userRequirements: string, configContent: string, rolesUsed: string[], validatedVariables?: string): string {
  return `**RANGE CONFIG QUALITY ASSURANCE CHECKLIST**

**CRITICAL INSTRUCTIONS FOR LLM:** 
1. Review the generated configuration against each item below. Mark each as PASS or FAIL with explanation.
2. **IMMEDIATELY after completing this checklist, you MUST run ludus_read_role_collection_schema** 
3. **Use the schema to double-check ALL role variables in your configuration:**
   - Verify all required variables are present for each role
   - Confirm variable names match schema exactly  
   - Check variable types are correct (string, boolean, list, etc.)
   - Ensure no variables are missing from your configuration
   - Include beneficial optional variables that would enhance the setup

**DO NOT PROCEED TO VALIDATION UNTIL SCHEMA CHECK IS COMPLETE**

---

## **USER REQUIREMENTS VERIFICATION**

**Original Requirements:**
\`\`\`
${userRequirements}
\`\`\`

**Generated Configuration:**
\`\`\`yaml
${configContent}
\`\`\`

---

## **MANDATORY VERIFICATION CHECKLIST**

### **1. USER REQUIREMENTS COVERAGE**
- [ ] **ALL user requirements are addressed** in the configuration
- [ ] **No missing functionality** from original request
- [ ] **Appropriate complexity level** matches user needs
- [ ] **Requested software/services** are all included
- [ ] **User specifications** (VM count, OS types, etc.) are met

### **2. ROLE SELECTION & IMPLEMENTATION**
**Roles Used:** ${rolesUsed.join(', ')}

**CRITICAL: Before marking this section complete, use ludus_read_role_collection_schema to verify ALL role variables for each role used.**

For EACH role, verify:
- [ ] **Role is appropriate** for the user requirements
- [ ] **Role variables are correctly configured** (not default/placeholder values)
- [ ] **Required variables are present** and have proper values
- [ ] **Optional variables** are configured where beneficial
- [ ] **Role dependencies** are properly handled
- [ ] **GitHub source verification** - variables match research from GitHub repos
- [ ] **SCHEMA VERIFICATION** - Use ludus_read_role_collection_schema to confirm all variables for this role are present and correctly configured

${validatedVariables ? `\n**Validated Variables Summary:**\n${validatedVariables}\n` : '\n**WARNING:** No validated variables summary provided. Ensure all role variables were researched from GitHub repositories.\n'}

### **3. CONFIGURATION STRUCTURE & SYNTAX**
- [ ] **Proper YAML syntax** and structure
- [ ] **Ludus section** with version and logging configured
- [ ] **VM specifications** appropriate for roles and complexity
- [ ] **Template selection** matches requirements (Windows/Linux)
- [ ] **Resource allocation** (CPU, RAM, disk) is reasonable
- [ ] **VM naming** follows logical convention

### **4. NETWORKING & CONNECTIVITY**
- [ ] **Network topology** supports all roles and requirements
- [ ] **Subnet configuration** is appropriate
- [ ] **Inter-VM connectivity** is properly planned
- [ ] **External connectivity** requirements are met
- [ ] **Security boundaries** are appropriate

### **5. DOMAIN & AUTHENTICATION**
- [ ] **Domain configuration** (if required) is present and correct
- [ ] **Domain controller** (if needed) is properly configured
- [ ] **Authentication setup** matches requirements
- [ ] **User accounts** and permissions are planned
- [ ] **Credential handling** follows guidelines: External service credentials (API keys, SaaS tokens) use {{LudusCredName-<user>-<cred>}} placeholders, range-internal credentials (Active Directory passwords, SCCM passwords, domain passwords, local accounts) included directly

### **6. ARCHITECTURE & DESIGN**
- [ ] **VM layout** makes logical sense for the use case
- [ ] **Dependencies** between VMs are properly ordered
- [ ] **Role distribution** across VMs is optimal
- [ ] **Scalability** considerations are addressed
- [ ] **Testing capabilities** are included if requested

### **7. SPECIAL REQUIREMENTS**
- [ ] **Workstation count** matches request (if specified)
- [ ] **Specific software versions** are configured (if specified)
- [ ] **Custom configurations** are included (if specified)
- [ ] **Testing infrastructure** is included (if requested)
- [ ] **Monitoring/logging** setup (if requested)

---

## **CRITICAL VALIDATION POINTS**

### **ROLE VARIABLE VERIFICATION**
**MANDATORY SCHEMA CHECK:** Run ludus_read_role_collection_schema NOW to verify each role below.

For each role in ${rolesUsed.join(', ')}, confirm:
1. **RUN SCHEMA CHECK:** Use ludus_read_role_collection_schema to get exact variable requirements
2. **Variables were researched** from GitHub repository OR schema
3. **All required variables** are present with proper values (compare against schema)
4. **No placeholder/example values** remain in the config
5. **Variable types** match expected formats from schema (strings, booleans, lists)
6. **Variable names** match schema exactly (no typos or variations)
7. **Dependencies** between role variables are handled
8. **Optional variables** that would benefit the setup are included per schema recommendations

### **COMPLETENESS CHECK**
- [ ] **Nothing from user requirements** was forgotten or omitted
- [ ] **All requested components** have corresponding roles/configuration
- [ ] **VM count and specifications** support all planned roles
- [ ] **Configuration is deployable** without additional manual steps

### **QUALITY INDICATORS**
- [ ] **Configuration looks production-ready** (not a template)
- [ ] **Values are specific** to this use case (not generic examples)
- [ ] **Documentation/comments** help explain complex configurations
- [ ] **Resource requirements** are realistic for the environment

---

## **QA SUMMARY**

**Review Results:**
- Total checklist items: ~25-30 items
- Items passed: ___
- Items failed: ___
- Critical issues found: ___

**Overall Assessment:** READY FOR VALIDATION / NEEDS REVISION

**Required Actions (if any):**
1. [List specific issues that need to be addressed]
2. [Additional research needed]
3. [Configuration changes required]

---

## **NEXT STEPS**

**MANDATORY BEFORE PROCEEDING:**
1. **Run ludus_read_role_collection_schema** to verify all role variables
2. **Compare your configuration** against schema requirements for each role
3. **Fix any missing or incorrect variables** found during schema check

**Then:**

If ALL checklist items pass AND schema validation is complete:
**Proceed to validate_range_config**

If ANY critical items fail OR schema check reveals issues:
**STOP - Revise configuration before validation**
- Address identified issues
- Complete schema validation and fix any role variable problems
- Re-run this QA check
- Only proceed when all items pass AND schema check is clean

**Remember:** This QA check + schema validation saves time by catching issues before formal validation!`;
} 