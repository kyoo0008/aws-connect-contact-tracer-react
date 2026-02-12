
// Domain Models
export interface QmEvaluationForm {
    formId: string;
    formName: string;
    description?: string;
    systemPrompt?: string;
    version: string;
    status: 'ACTIVE' | 'INACTIVE' | 'DRAFT';
    createdAt: string;
    updatedAt: string;
    categories?: EvaluationCategory[];
}

export interface EvaluationCategory {
    categoryId: string;
    categoryName: string;
    displayOrder: number;
    enabled: boolean;
    weight: number;
    instructions?: string[];
    feedbackMessageTemplate?: string;
    subItems?: EvaluationSubItem[];
}

export interface EvaluationSubItem {
    subItemId: string;
    subItemName: string;
    displayOrder: number;
    evaluationCriteria: EvaluationCriterion[];
    outputJsonSchema?: Record<string, unknown>;
    resultJsonFormat?: string;
    instruction?: string;
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
    systemPrompt?: string;
    version: string;
    status: 'ACTIVE' | 'INACTIVE' | 'DRAFT';
}

export interface UpdateQmEvaluationFormRequest {
    formName?: string;
    description?: string;
    systemPrompt?: string;
    version?: string;
    status?: 'ACTIVE' | 'INACTIVE' | 'DRAFT';
}

export interface CreateCategoryRequest {
    categoryId?: string;
    categoryName: string;
    displayOrder: number;
    enabled?: boolean;
    weight?: number;
    instructions?: string[];
    feedbackMessageTemplate?: string;
}

export interface UpdateCategoryRequest {
    categoryName?: string;
    displayOrder?: number;
    enabled?: boolean;
    weight?: number;
    instructions?: string[];
    feedbackMessageTemplate?: string;
}

export interface CreateSubItemRequest {
    subItemId?: string;
    subItemName: string;
    displayOrder: number;
    evaluationCriteria: EvaluationCriterion[];
    outputJsonSchema?: Record<string, unknown>;
    resultJsonFormat?: string;
    instruction?: string;
}

export interface UpdateSubItemRequest {
    subItemName?: string;
    displayOrder?: number;
    evaluationCriteria?: EvaluationCriterion[];
    outputJsonSchema?: Record<string, unknown>;
    resultJsonFormat?: string;
    instruction?: string;
}

// Bulk Update Category Request
export interface BulkCategoryItem {
    categoryId: string;
    categoryName: string;
    displayOrder: number;
    enabled: boolean;
    weight: number;
    instructions?: string[];
    feedbackMessageTemplate?: string;
    subItems?: BulkSubItem[];
}

export interface BulkSubItem {
    subItemId: string;
    subItemName: string;
    displayOrder: number;
    evaluationCriteria: EvaluationCriterion[];
    outputJsonSchema?: Record<string, unknown>;
    resultJsonFormat?: string;
    instruction?: string;
}

export interface BulkUpdateCategoriesRequest {
    categories: BulkCategoryItem[];
}
