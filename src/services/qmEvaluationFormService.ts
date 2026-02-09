import { AWSConfig } from '@/types/contact.types';
import {
    QmEvaluationForm,
    EvaluationCategory,
    EvaluationSubItem,
    CreateQmEvaluationFormRequest,
    UpdateQmEvaluationFormRequest,
    CreateCategoryRequest,
    UpdateCategoryRequest,
    CreateSubItemRequest,
    UpdateSubItemRequest,
    BulkUpdateCategoriesRequest,
} from '@/types/qmEvaluationForm.types';

// API Base URL - Environment dependent
const getApiBaseUrl = (environment: string): string => {
    return 'http://localhost:8081';
};

/**
 * Get all QM Evaluation Forms
 */
export async function getQmEvaluationForms(
    config: AWSConfig
): Promise<QmEvaluationForm[]> {
    const apiBaseUrl = getApiBaseUrl(config.environment);

    try {
        const response = await fetch(`${apiBaseUrl}/api/agent/v1/qm-evaluation-form`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-aws-region': config.region,
                'x-environment': config.environment,
                ...(config.credentials && {
                    'x-aws-credentials': JSON.stringify(config.credentials),
                }),
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch forms: ${response.status}`);
        }

        const data = await response.json();
        if (Array.isArray(data)) return data;
        if (data.items && Array.isArray(data.items)) return data.items;
        if (data.data && Array.isArray(data.data)) return data.data;
        return [];
    } catch (error) {
        console.error('Error fetching QM Evaluation Forms:', error);
        throw error;
    }
}

/**
 * Get a specific QM Evaluation Form by ID
 */
export async function getQmEvaluationForm(
    formId: string,
    config: AWSConfig
): Promise<QmEvaluationForm> {
    const apiBaseUrl = getApiBaseUrl(config.environment);

    try {
        const response = await fetch(
            `${apiBaseUrl}/api/agent/v1/qm-evaluation-form/${encodeURIComponent(formId)}`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-aws-region': config.region,
                    'x-environment': config.environment,
                    ...(config.credentials && {
                        'x-aws-credentials': JSON.stringify(config.credentials),
                    }),
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch form details: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error fetching QM Evaluation Form ${formId}:`, error);
        throw error;
    }
}

/**
 * Create a new QM Evaluation Form
 */
export async function createQmEvaluationForm(
    data: CreateQmEvaluationFormRequest,
    config: AWSConfig
): Promise<QmEvaluationForm> {
    const apiBaseUrl = getApiBaseUrl(config.environment);

    try {
        const response = await fetch(`${apiBaseUrl}/api/agent/v1/qm-evaluation-form`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-aws-region': config.region,
                'x-environment': config.environment,
                ...(config.credentials && {
                    'x-aws-credentials': JSON.stringify(config.credentials),
                }),
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error(`Failed to create form: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error creating QM Evaluation Form:', error);
        throw error;
    }
}

/**
 * Update an existing QM Evaluation Form
 */
export async function updateQmEvaluationForm(
    formId: string,
    data: UpdateQmEvaluationFormRequest,
    config: AWSConfig
): Promise<QmEvaluationForm> {
    const apiBaseUrl = getApiBaseUrl(config.environment);

    try {
        const response = await fetch(
            `${apiBaseUrl}/api/agent/v1/qm-evaluation-form/${encodeURIComponent(formId)}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-aws-region': config.region,
                    'x-environment': config.environment,
                    ...(config.credentials && {
                        'x-aws-credentials': JSON.stringify(config.credentials),
                    }),
                },
                body: JSON.stringify(data),
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to update form: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error updating QM Evaluation Form ${formId}:`, error);
        throw error;
    }
}

/**
 * Delete a QM Evaluation Form
 */
export async function deleteQmEvaluationForm(
    formId: string,
    config: AWSConfig
): Promise<void> {
    const apiBaseUrl = getApiBaseUrl(config.environment);

    try {
        const response = await fetch(
            `${apiBaseUrl}/api/agent/v1/qm-evaluation-form/${encodeURIComponent(formId)}`,
            {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'x-aws-region': config.region,
                    'x-environment': config.environment,
                    ...(config.credentials && {
                        'x-aws-credentials': JSON.stringify(config.credentials),
                    }),
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to delete form: ${response.status}`);
        }
    } catch (error) {
        console.error(`Error deleting QM Evaluation Form ${formId}:`, error);
        throw error;
    }
}

/**
 * Get Categories for a Form
 */
export async function getCategories(
    formId: string,
    config: AWSConfig
): Promise<EvaluationCategory[]> {
    const apiBaseUrl = getApiBaseUrl(config.environment);

    try {
        const response = await fetch(
            `${apiBaseUrl}/api/agent/v1/qm-evaluation-form/${encodeURIComponent(formId)}/categories`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-aws-region': config.region,
                    'x-environment': config.environment,
                    ...(config.credentials && {
                        'x-aws-credentials': JSON.stringify(config.credentials),
                    }),
                },
            }
        );

        if (!response.ok) {
            if (response.status === 404) return [];
            throw new Error(`Failed to fetch categories: ${response.status}`);
        }

        const data = await response.json();
        if (Array.isArray(data)) return data;
        if (data.categories && Array.isArray(data.categories)) return data.categories;
        if (data.items && Array.isArray(data.items)) return data.items;
        if (data.data && Array.isArray(data.data)) return data.data;
        return [];
    } catch (error) {
        console.error(`Error fetching categories for form ${formId}:`, error);
        throw error;
    }
}

/**
 * Add or Update a Category
 * Note: The plan says POST for add/update, which might mean upsert or separate endpoints.
 * Assuming POST creates/upserts as per "Category Add/Modify" description.
 */
export async function createCategory(
    formId: string,
    data: CreateCategoryRequest,
    config: AWSConfig
): Promise<EvaluationCategory> {
    const apiBaseUrl = getApiBaseUrl(config.environment);

    try {
        const response = await fetch(
            `${apiBaseUrl}/api/agent/v1/qm-evaluation-form/${encodeURIComponent(formId)}/categories`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-aws-region': config.region,
                    'x-environment': config.environment,
                    ...(config.credentials && {
                        'x-aws-credentials': JSON.stringify(config.credentials),
                    }),
                },
                body: JSON.stringify(data),
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to create category: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error creating category for form ${formId}:`, error);
        throw error;
    }
}

/**
 * Update an existing Category
 */
export async function updateCategory(
    formId: string,
    categoryId: string,
    data: UpdateCategoryRequest,
    config: AWSConfig
): Promise<EvaluationCategory> {
    const apiBaseUrl = getApiBaseUrl(config.environment);

    try {
        const response = await fetch(
            `${apiBaseUrl}/api/agent/v1/qm-evaluation-form/${encodeURIComponent(formId)}/categories`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-aws-region': config.region,
                    'x-environment': config.environment,
                    ...(config.credentials && {
                        'x-aws-credentials': JSON.stringify(config.credentials),
                    }),
                },
                body: JSON.stringify({ ...data, categoryId }),
            }
        );
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to update category: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error updating category ${categoryId} for form ${formId}:`, error);
        throw error;
    }
}

/**
 * Update an existing Category
 */
export async function updateCategoryOrder(
    formId: string,
    categoryId: string,
    data: UpdateCategoryRequest,
    config: AWSConfig
): Promise<EvaluationCategory> {
    const apiBaseUrl = getApiBaseUrl(config.environment);

    try {
        const response = await fetch(
            `${apiBaseUrl}/api/agent/v1/qm-evaluation-form/${encodeURIComponent(formId)}/categories/order`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-aws-region': config.region,
                    'x-environment': config.environment,
                    ...(config.credentials && {
                        'x-aws-credentials': JSON.stringify(config.credentials),
                    }),
                },
                body: JSON.stringify({ ...data, categoryId }),
            }
        );
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to update category: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error updating category ${categoryId} for form ${formId}:`, error);
        throw error;
    }
}

/**
 * Delete a Category
 */
export async function deleteCategory(
    formId: string,
    categoryId: string,
    config: AWSConfig
): Promise<void> {
    const apiBaseUrl = getApiBaseUrl(config.environment);

    try {
        const response = await fetch(
            `${apiBaseUrl}/api/agent/v1/qm-evaluation-form/${encodeURIComponent(formId)}/categories/${encodeURIComponent(categoryId)}`,
            {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'x-aws-region': config.region,
                    'x-environment': config.environment,
                    ...(config.credentials && {
                        'x-aws-credentials': JSON.stringify(config.credentials),
                    }),
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to delete category: ${response.status}`);
        }
    } catch (error) {
        console.error(`Error deleting category ${categoryId}:`, error);
        throw error;
    }
}

/**
 * Get SubItems for a Category
 */
export async function getSubItems(
    formId: string,
    categoryId: string,
    config: AWSConfig
): Promise<EvaluationSubItem[]> {
    const apiBaseUrl = getApiBaseUrl(config.environment);

    try {
        const response = await fetch(
            `${apiBaseUrl}/api/agent/v1/qm-evaluation-form/${encodeURIComponent(formId)}/categories/${encodeURIComponent(categoryId)}/subitems`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-aws-region': config.region,
                    'x-environment': config.environment,
                    ...(config.credentials && {
                        'x-aws-credentials': JSON.stringify(config.credentials),
                    }),
                },
            }
        );

        if (!response.ok) {
            if (response.status === 404) return [];
            throw new Error(`Failed to fetch subitems: ${response.status}`);
        }

        const data = await response.json();
        if (Array.isArray(data)) return data;
        if (data.subItems && Array.isArray(data.subItems)) return data.subItems;
        if (data.items && Array.isArray(data.items)) return data.items;
        if (data.data && Array.isArray(data.data)) return data.data;
        return [];
    } catch (error) {
        console.error(`Error fetching subitems for category ${categoryId}:`, error);
        throw error;
    }
}

/**
 * Add or Update a SubItem
 */
export async function createSubItem(
    formId: string,
    categoryId: string,
    data: CreateSubItemRequest,
    config: AWSConfig
): Promise<EvaluationSubItem> {
    const apiBaseUrl = getApiBaseUrl(config.environment);

    try {
        const response = await fetch(
            `${apiBaseUrl}/api/agent/v1/qm-evaluation-form/${encodeURIComponent(formId)}/categories/${encodeURIComponent(categoryId)}/subitems`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-aws-region': config.region,
                    'x-environment': config.environment,
                    ...(config.credentials && {
                        'x-aws-credentials': JSON.stringify(config.credentials),
                    }),
                },
                body: JSON.stringify(data),
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to create subitem: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error creating subitem for category ${categoryId}:`, error);
        throw error;
    }
}

/**
 * Update an existing SubItem
 */
export async function updateSubItem(
    formId: string,
    categoryId: string,
    subItemId: string,
    data: UpdateSubItemRequest,
    config: AWSConfig
): Promise<EvaluationSubItem> {
    const apiBaseUrl = getApiBaseUrl(config.environment);

    try {
        const response = await fetch(
            `${apiBaseUrl}/api/agent/v1/qm-evaluation-form/${encodeURIComponent(formId)}/categories/${encodeURIComponent(categoryId)}/subitems`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-aws-region': config.region,
                    'x-environment': config.environment,
                    ...(config.credentials && {
                        'x-aws-credentials': JSON.stringify(config.credentials),
                    }),
                },
                body: JSON.stringify({ ...data, subItemId }),
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to update subitem: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error updating subitem ${subItemId} for category ${categoryId}:`, error);
        throw error;
    }
}

/**
 * Delete a SubItem
 */
export async function deleteSubItem(
    formId: string,
    categoryId: string,
    subItemId: string,
    config: AWSConfig
): Promise<void> {
    const apiBaseUrl = getApiBaseUrl(config.environment);

    try {
        const response = await fetch(
            `${apiBaseUrl}/api/agent/v1/qm-evaluation-form/${encodeURIComponent(formId)}/categories/${encodeURIComponent(categoryId)}/subitems/${encodeURIComponent(subItemId)}`,
            {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'x-aws-region': config.region,
                    'x-environment': config.environment,
                    ...(config.credentials && {
                        'x-aws-credentials': JSON.stringify(config.credentials),
                    }),
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to delete subitem: ${response.status}`);
        }
    } catch (error) {
        console.error(`Error deleting subitem ${subItemId}:`, error);
        throw error;
    }
}

/**
 * Bulk Update Categories (with SubItems)
 */
export async function bulkUpdateCategories(
    formId: string,
    data: BulkUpdateCategoriesRequest,
    config: AWSConfig
): Promise<EvaluationCategory[]> {
    const apiBaseUrl = getApiBaseUrl(config.environment);

    try {
        const response = await fetch(
            `${apiBaseUrl}/api/agent/v1/qm-evaluation-form/${encodeURIComponent(formId)}/categories/bulk`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-aws-region': config.region,
                    'x-environment': config.environment,
                    ...(config.credentials && {
                        'x-aws-credentials': JSON.stringify(config.credentials),
                    }),
                },
                body: JSON.stringify(data),
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to bulk update categories: ${response.status}`);
        }

        const result = await response.json();
        if (Array.isArray(result)) return result;
        if (result.categories && Array.isArray(result.categories)) return result.categories;
        if (result.data && Array.isArray(result.data)) return result.data;
        return [];
    } catch (error) {
        console.error(`Error bulk updating categories for form ${formId}:`, error);
        throw error;
    }
}
