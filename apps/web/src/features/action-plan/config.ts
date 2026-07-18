export const ACTION_PLAN_SCORE_WEIGHTS = {
  TASK_OVERDUE_GT_24H: 50,
  TASK_OVERDUE_LT_24H: 40,
  DUE_TODAY: 35,
  HIGH_PRIORITY: 25,
  MEDIUM_PRIORITY: 10,
  SNOOZED: 10,
  SNOOZED_MULTIPLE_TIMES: 20,
  RELATIONSHIP_INACTIVE_14D: 20,
  RELATIONSHIP_INACTIVE_30D: 35,
  IMPORTANT_WITHOUT_DUE_DATE: 15
} as const;

export const ACTION_PLAN_THRESHOLDS = {
  overdueCriticalHours: 24,
  multipleSnoozes: 3,
  inactiveRelationshipDays: 14,
  veryInactiveRelationshipDays: 30,
  criticalScore: 70,
  priorityMinScore: 35,
  priorityMaxScore: 69
} as const;

export const ACTION_PLAN_CATEGORY_ORDER = {
  critical: 0,
  priority: 1,
  opportunity: 2,
  to_schedule: 3
} as const;

export const FOLLOW_UP_KEYWORDS = ["relance", "relancer", "rappel", "appel", "reprise de contact", "recontacter", "suivi"] as const;
