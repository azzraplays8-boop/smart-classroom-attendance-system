/**
 * Dynamic Label Resolver
 * 
 * Provides hooks and utility functions to resolve labels dynamically
 * based on the organization type configuration.
 * 
 * Usage:
 *   const labels = useOrgLabels(); // Returns all resolved labels
 *   labels.entityLabel       => "Students" | "Members" | "Employees" | etc.
 *   labels.primaryIdLabel    => "Student Number" | "Member ID" | etc.
 */

import { useMemo } from "react";
import { useSettings } from "../context/SettingsContext";
import { getOrgConfig } from "./organizationDefaults";

/**
 * Resolves the effective labels for the current organization.
 * Merges organization type defaults with any custom overrides from settings.
 */
export function resolveOrgLabels(orgType, customLabels = {}) {
  const config = getOrgConfig(orgType);

  return {
    // Entity labels
    entityName: customLabels.entityName || config.entity.entityName,
    entityLabel: customLabels.entityLabel || config.entity.entityLabel,
    entityNamePlural: customLabels.entityNamePlural || config.entity.entityNamePlural,
    primaryIdLabel: customLabels.primaryIdLabel || config.entity.primaryIdLabel,
    departmentLabel: customLabels.departmentLabel || config.entity.departmentLabel,
    groupLabel: customLabels.groupLabel || config.entity.groupLabel,
    roleLabel: customLabels.roleLabel || config.entity.roleLabel,

    // Attendance terminology
    registeredMemberLabel: customLabels.registeredMemberLabel || config.attendance.registeredMemberLabel,
    checkedInLabel: customLabels.checkedInLabel || config.attendance.checkedInLabel,
    lateLabel: customLabels.lateLabel || config.attendance.lateLabel,
    absentLabel: customLabels.absentLabel || config.attendance.absentLabel,

    // Organization info
    orgIcon: config.icon,
    orgLabel: config.label,
    orgType: orgType,
  };
}

/**
 * Hook to get resolved org labels in any component.
 * Re-computes when settings change.
 */
export function useOrgLabels() {
  const { settings } = useSettings();

  return useMemo(() => {
    const orgType = settings.organizationType || "school";
    const customLabels = {
      entityName: settings.entityName,
      entityLabel: settings.entityLabel,
      primaryIdLabel: settings.primaryIdLabel,
      departmentLabel: settings.departmentLabel,
      groupLabel: settings.groupLabel,
      roleLabel: settings.roleLabel,
      checkedInLabel: settings.checkedInLabel,
      lateLabel: settings.lateLabel,
      absentLabel: settings.absentLabel,
      registeredMemberLabel: settings.registeredMemberLabel || settings.entityLabel,
    };
    return resolveOrgLabels(orgType, customLabels);
  }, [settings]);
}

/**
 * Simple function to get labels (non-hook version for non-component usage).
 */
export function getOrgLabelsByType(orgType) {
  return resolveOrgLabels(orgType, {});
}

