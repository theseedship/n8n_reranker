import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';

import { rerankDocuments } from '../shared/reranker-logic';

/**
 * Ollama Reranker Workflow Node
 *
 * A chainable workflow node that reranks documents using Ollama models.
 * Can be used in standard workflows AND as an AI Agent Tool.
 *
 * Differences from Provider node:
 * - Has inputs/outputs (Main connection type)
 * - Implements execute() method
 * - Processes items from workflow
 * - Can be used as AI Agent Tool (usableAsTool: true)
 */
export class OllamaRerankerWorkflow implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Ollama Reranker Workflow',
		name: 'ollamaRerankerWorkflow',
		icon: 'file:ollama.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["model"]}}',
		description: 'Rerank documents using Ollama models (chainable workflow node + AI tool)',
		defaults: {
			name: 'Ollama Reranker Workflow',
		},
		usableAsTool: true, // ✅ Safe here (no supplyData conflict)
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Agents', 'Chains', 'Tools'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://github.com/ollama/ollama/blob/main/docs/api.md',
					},
				],
			},
		},
		// Workflow node pattern: Has inputs AND outputs
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		outputNames: ['Reranked Documents'],
		credentials: [
			{
				name: 'ollamaApi',
				required: true,
			},
		],
		requestDefaults: {
			ignoreHttpStatusErrors: true,
			baseURL: '={{ $credentials.baseUrl.replace(new RegExp("/$"), "") }}',
		},
		properties: [
			// Model selection with dynamic loading (using routing like Ollama Chat Model)
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				default: '',
				description: 'The reranker model to use - models are loaded from your configured Ollama/Custom API',
				typeOptions: {
					loadOptions: {
						routing: {
							request: {
								method: 'GET',
								url: '/api/tags',
							},
							output: {
								postReceive: [
									{
										type: 'rootProperty',
										properties: {
											property: 'models',
										},
									},
									{
										type: 'setKeyValue',
										properties: {
											name: '={{$responseItem.name}}',
											value: '={{$responseItem.name}}',
										},
									},
									{
										type: 'sort',
										properties: {
											key: 'name',
										},
									},
								],
							},
						},
					},
				},
				required: true,
			},
			// API Type selection
			{
				displayName: 'API Type',
				name: 'apiType',
				type: 'options',
				options: [
					{
						name: 'Ollama Generate API',
						value: 'ollama',
						description: 'Standard Ollama /api/generate endpoint (for BGE, Qwen prompt-based rerankers)',
					},
					{
						name: 'Custom Rerank API',
						value: 'custom',
						description: 'Custom /api/rerank endpoint (for deposium-embeddings-turbov2, etc.)',
					},
				],
				default: 'ollama',
				description: 'Which API endpoint to use for reranking',
			},
			// Query input (flexible like n8n nodes)
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				default: '',
				placeholder: '={{$json.query}}',
				description: 'Query to rank documents against (supports expressions)',
				required: true,
			},
			// Documents source (flexible input)
			{
				displayName: 'Documents Source',
				name: 'documentsSource',
				type: 'options',
				options: [
					{
						name: 'From Input Items',
						value: 'items',
						description: 'Use all input items as documents',
					},
					{
						name: 'From Field',
						value: 'field',
						description: 'Extract documents from a specific field',
					},
					{
						name: 'From Expression',
						value: 'expression',
						description: 'Use a custom expression to get documents',
					},
				],
				default: 'items',
				description: 'Where to get documents from',
			},
			{
				displayName: 'Document Field',
				name: 'documentField',
				type: 'string',
				default: 'documents',
				placeholder: 'documents',
				description: 'Field name containing the documents array',
				displayOptions: {
					show: {
						documentsSource: ['field'],
					},
				},
			},
			{
				displayName: 'Documents Expression',
				name: 'documentsExpression',
				type: 'string',
				default: '={{$json.documents}}',
				placeholder: '={{$json.documents}}',
				description: 'Expression to evaluate to get documents',
				displayOptions: {
					show: {
						documentsSource: ['expression'],
					},
				},
			},
			// Document content field (when using items as documents)
			{
				displayName: 'Document Content Field',
				name: 'contentField',
				type: 'string',
				default: 'pageContent',
				placeholder: 'pageContent',
				description: 'Field containing document text (e.g., pageContent, text, content)',
				displayOptions: {
					show: {
						documentsSource: ['items'],
					},
				},
			},
			// Top K
			{
				displayName: 'Top K',
				name: 'topK',
				type: 'number',
				default: 10,
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
				description: 'Number of top documents to return',
			},
			// Threshold
			{
				displayName: 'Score Threshold',
				name: 'threshold',
				type: 'number',
				default: 0.0,
				typeOptions: {
					minValue: 0,
					maxValue: 1,
					numberPrecision: 2,
				},
				description: 'Minimum relevance score (0-1)',
			},
			// Instruction
			{
				displayName: 'Task Instruction',
				name: 'instruction',
				type: 'string',
				default: 'Given a web search query, retrieve relevant passages that answer the query',
				description: 'Custom instruction for reranking',
			},
			// Additional options
			{
				displayName: 'Additional Options',
				name: 'additionalOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Include Original Scores',
						name: 'includeOriginalScores',
						type: 'boolean',
						default: false,
						description: 'Include original document scores if available',
					},
					{
						displayName: 'Request Timeout (ms)',
						name: 'timeout',
						type: 'number',
						default: 30000,
						typeOptions: {
							minValue: 1000,
							maxValue: 300000,
						},
						description: 'Maximum time per API request',
					},
					{
						displayName: 'Batch Size',
						name: 'batchSize',
						type: 'number',
						default: 10,
						typeOptions: {
							minValue: 1,
							maxValue: 50,
						},
						description: 'Number of documents to process concurrently',
					},
					{
						displayName: 'Output Format',
						name: 'outputFormat',
						type: 'options',
						options: [
							{
								name: 'Documents with Scores',
								value: 'documents',
								description: 'Array of document objects with _rerankScore',
							},
							{
								name: 'Simple Array',
								value: 'simple',
								description: 'Simple array of document contents',
							},
						],
						default: 'documents',
						description: 'How to format output documents',
					},
					// VL Classifier specific options
					{
						displayName: 'Enable VL Classification',
						name: 'enableClassification',
						type: 'boolean',
						default: true,
						description: 'Use Vision-Language classifier to analyze document complexity',
						displayOptions: {
							show: {
								'/apiType': ['vl-classifier'],
							},
						},
					},
					{
						displayName: 'Classification Strategy',
						name: 'classificationStrategy',
						type: 'options',
						options: [
							{
								name: 'Add Metadata Only',
								value: 'metadata',
								description: 'Add complexity classification as document metadata',
							},
							{
								name: 'Filter Documents',
								value: 'filter',
								description: 'Filter documents based on complexity',
							},
							{
								name: 'Filter + Metadata',
								value: 'both',
								description: 'Both filter and add metadata',
							},
						],
						default: 'metadata',
						description: 'How to use the classification results',
						displayOptions: {
							show: {
								'/apiType': ['vl-classifier'],
								'enableClassification': [true],
							},
						},
					},
					{
						displayName: 'Filter Complexity',
						name: 'filterComplexity',
						type: 'options',
						options: [
							{
								name: 'Low Complexity Only',
								value: 'LOW',
								description: 'Keep only simple documents (good for OCR)',
							},
							{
								name: 'High Complexity Only',
								value: 'HIGH',
								description: 'Keep only complex documents (good for VLM)',
							},
							{
								name: 'Both',
								value: 'both',
								description: 'Keep all documents regardless of complexity',
							},
						],
						default: 'both',
						description: 'Which complexity level to keep when filtering',
						displayOptions: {
							show: {
								'/apiType': ['vl-classifier'],
								'enableClassification': [true],
								'classificationStrategy': ['filter', 'both'],
							},
						},
					},
				],
			},
		],
	};

	/**
	 * Execute Method (NOT supplyData!)
	 *
	 * Workflow nodes use execute() to process items from input connections
	 * and return processed items to output connections.
	 */
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// Get credentials
		const credentials = await this.getCredentials('ollamaApi');
		if (!credentials?.baseUrl) {
			throw new NodeOperationError(
				this.getNode(),
				'Ollama Base URL not configured. Please add Ollama API credentials.',
			);
		}
		const ollamaHost = (credentials.baseUrl as string).replace(/\/$/, '');

		// Get model
		const model = this.getNodeParameter('model', 0) as string;
		if (!model?.trim()) {
			throw new NodeOperationError(
				this.getNode(),
				'Model selection is required. Please select a model from the dropdown.',
			);
		}

		// Get API type and auto-detect if needed
		let apiType = this.getNodeParameter('apiType', 0, 'ollama') as string;
		if (apiType === 'auto') {
			const { detectServerType } = await import('../shared/reranker-logic');
			apiType = await detectServerType(this, ollamaHost);
		}

		// Get common parameters
		const instruction = this.getNodeParameter('instruction', 0) as string;
		const topK = this.getNodeParameter('topK', 0) as number;
		const threshold = this.getNodeParameter('threshold', 0) as number;
		const additionalOptions = this.getNodeParameter('additionalOptions', 0, {}) as {
			includeOriginalScores?: boolean;
			timeout?: number;
			batchSize?: number;
			outputFormat?: string;
			enableClassification?: boolean;
			classificationStrategy?: 'filter' | 'metadata' | 'both';
			filterComplexity?: 'LOW' | 'HIGH' | 'both';
		};

		const timeout = additionalOptions.timeout ?? 30000;
		const batchSize = additionalOptions.batchSize ?? 10;
		const includeOriginalScores = additionalOptions.includeOriginalScores ?? false;
		const outputFormat = additionalOptions.outputFormat ?? 'documents';
		const enableClassification = additionalOptions.enableClassification ?? true;
		const classificationStrategy = additionalOptions.classificationStrategy ?? 'metadata';
		const filterComplexity = additionalOptions.filterComplexity ?? 'both';

		// Process each input item
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				// Get query (supports expressions)
				const query = this.getNodeParameter('query', itemIndex) as string;
				if (!query?.trim()) {
					throw new NodeOperationError(
						this.getNode(),
						'Query cannot be empty',
						{ itemIndex },
					);
				}

				// Get documents based on source type
				const documentsSource = this.getNodeParameter('documentsSource', itemIndex) as string;
				let documents: any[] = [];

				if (documentsSource === 'items') {
					// Use all input items as documents
					const contentField = this.getNodeParameter('contentField', itemIndex) as string;
					documents = items.map((item, idx) => ({
						pageContent: item.json[contentField] || JSON.stringify(item.json),
						metadata: item.json.metadata || {},
						_originalIndex: idx,
					}));
				} else if (documentsSource === 'field') {
					// Extract from specific field
					const documentField = this.getNodeParameter('documentField', itemIndex) as string;
					const docsFromField = items[itemIndex].json[documentField];
					if (!Array.isArray(docsFromField)) {
						throw new NodeOperationError(
							this.getNode(),
							`Field "${documentField}" must be an array of documents`,
							{ itemIndex },
						);
					}
					documents = docsFromField;
				} else if (documentsSource === 'expression') {
					// Use custom expression
					const documentsExpression = this.getNodeParameter('documentsExpression', itemIndex) as any;
					if (!Array.isArray(documentsExpression)) {
						throw new NodeOperationError(
							this.getNode(),
							'Documents expression must evaluate to an array',
							{ itemIndex },
						);
					}
					documents = documentsExpression;
				}

				if (documents.length === 0) {
					// No documents to rerank, return empty result
					returnData.push({
						json: {
							query,
							documents: [],
							message: 'No documents to rerank',
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				// Normalize documents to standard format
				const processedDocs = documents.map((doc, docIndex) => {
					if (doc && typeof doc === 'object') {
						return {
							pageContent: doc.pageContent || doc.text || doc.content || JSON.stringify(doc),
							metadata: doc.metadata || {},
							_originalIndex: docIndex,
							...(doc._originalScore !== undefined ? { _originalScore: doc._originalScore } : {}),
						};
					}
					return {
						pageContent: String(doc),
						metadata: {},
						_originalIndex: docIndex,
					};
				});

				// Rerank documents
				const rerankedDocs = await rerankDocuments(this, {
					ollamaHost,
					model,
					query,
					documents: processedDocs,
					instruction,
					topK,
					threshold,
					batchSize,
					timeout,
					includeOriginalScores,
					apiType: apiType as 'ollama' | 'custom' | 'vl-classifier',
					enableClassification,
					classificationStrategy: classificationStrategy as 'filter' | 'metadata' | 'both',
					filterComplexity: filterComplexity as 'LOW' | 'HIGH' | 'both',
				});

				// Format output
				let output: any;
				if (outputFormat === 'simple') {
					output = {
						query,
						documents: rerankedDocs.map((doc: any) => doc.pageContent),
					};
				} else {
					output = {
						query,
						documents: rerankedDocs,
					};
				}

				returnData.push({
					json: output,
					pairedItem: { item: itemIndex },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
