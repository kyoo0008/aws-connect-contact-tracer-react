
// Domain Models
export interface QmEvaluationForm {
    formId: string;
    formName: string;
    description?: string;
    version: string;
    status: 'ACTIVE' | 'INACTIVE' | 'DRAFT';
    createdAt: string;
    updatedAt: string;
}

export interface EvaluationCategory {
    categoryId: string;
    categoryName: string;
    displayOrder: number;
    enabled: boolean;
    weight: number;
    promptSection?: string;
    feedbackMessageTemplate?: string;
}

export interface EvaluationSubItem {
    subItemId: string;
    subItemName: string;
    displayOrder: number;
    evaluationCriteria: EvaluationCriterion[];
    outputJsonSchema?: Record<string, unknown>;
}

export interface EvaluationCriterion {
    criteriaId: string;
    description: string;
    details: string;
}

// DTOs for Create/Update
export interface CreateQmEvaluationFormRequest {
    formName: string;
    description?: string;
    version: string;
    status: 'ACTIVE' | 'INACTIVE' | 'DRAFT';
}

export interface UpdateQmEvaluationFormRequest {
    formName?: string;
    description?: string;
    version?: string;
    status?: 'ACTIVE' | 'INACTIVE' | 'DRAFT';
}

export interface CreateCategoryRequest {
    categoryId?: string;
    categoryName: string;
    displayOrder: number;
    enabled?: boolean;
    weight?: number;
    promptSection?: string;
    feedbackMessageTemplate?: string;
}

export interface UpdateCategoryRequest {
    categoryName?: string;
    displayOrder?: number;
    enabled?: boolean;
    weight?: number;
    promptSection?: string;
    feedbackMessageTemplate?: string;
}

export interface CreateSubItemRequest {
    subItemId?: string;
    subItemName: string;
    displayOrder: number;
    evaluationCriteria: EvaluationCriterion[];
    outputJsonSchema?: Record<string, unknown>;
}

export interface UpdateSubItemRequest {
    subItemName?: string;
    displayOrder?: number;
    evaluationCriteria?: EvaluationCriterion[];
    outputJsonSchema?: Record<string, unknown>;
}
