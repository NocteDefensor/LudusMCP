// ============================================================================
// LUDUS MCP PROMPTS - STATIC PROMPT EXPORTS
// ============================================================================

import { Prompt } from '@modelcontextprotocol/sdk/types.js';

export const createLudusRangePrompt: Prompt = {
  name: "create-ludus-range",
  description: "Create a complete Ludus cyber range from your requirements. Handles the entire workflow from planning to validation.",
  arguments: [
    { 
      name: "requirements", 
      description: "Describe what you want to build in natural language (e.g., 'AD range with one workstation, dedicated file server, SCCM, and Elastic watching the workstation joined to Tailscale')", 
      required: true 
    },
    { 
      name: "roles", 
      description: "Optional: Specify desired Ludus roles/collections to use (e.g., 'ludus_sccm, ludus_elastic_agent, ludus_tailscale')", 
      required: false 
    },
    { 
      name: "save_config", 
      description: "Whether to save the generated configuration to file (true/false)", 
      required: false 
    }
  ]
};

export const executeLudusCmdPrompt: Prompt = {
  name: "execute-ludus-cmd",
  description: "Safely execute Ludus CLI commands with comprehensive safety protocols, tool preference checking, and destructive action confirmation.",
  arguments: [
    {
      name: "command_intent",
      description: "Describe what you want to accomplish with the CLI command (e.g., 'check range status', 'get user information', 'abort stuck deployment')",
      required: true
    },
    {
      name: "target_user", 
      description: "Target user for admin operations (leave empty for current user operations)",
      required: false
    },
    {
      name: "confirm_destructive",
      description: "Set to true only AFTER user explicitly confirms destructive operations (type: true/false, TRUE/FALSE, or t/f)",
      required: false
    }
  ]
};

// Export all prompts as an array for easy registration
export const ALL_PROMPTS = [
  createLudusRangePrompt,
  executeLudusCmdPrompt
]; 