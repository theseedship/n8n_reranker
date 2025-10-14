import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

export class ExampleNode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Example Node',
		name: 'exampleNode',
		icon: 'file:example.svg',
		group: ['transform'],
		version: 1,
		description: 'Example custom node for n8n',
		defaults: {
			name: 'Example Node',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'exampleCredentials',
				required: false,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Transform Text',
						value: 'transformText',
						description: 'Transform input text',
						action: 'Transform text',
					},
					{
						name: 'Generate Data',
						value: 'generateData',
						description: 'Generate example data',
						action: 'Generate example data',
					},
				],
				default: 'transformText',
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				default: '',
				placeholder: 'Enter text to transform',
				description: 'The text to process',
				displayOptions: {
					show: {
						operation: ['transformText'],
					},
				},
			},
			{
				displayName: 'Count',
				name: 'count',
				type: 'number',
				default: 5,
				description: 'Number of items to generate',
				displayOptions: {
					show: {
						operation: ['generateData'],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				if (operation === 'transformText') {
					const text = this.getNodeParameter('text', i) as string;

					returnData.push({
						json: {
							original: text,
							transformed: text.toUpperCase(),
							length: text.length,
							reversed: text.split('').reverse().join(''),
							timestamp: new Date().toISOString(),
						},
						pairedItem: { item: i },
					});
				} else if (operation === 'generateData') {
					const count = this.getNodeParameter('count', i) as number;

					for (let j = 0; j < count; j++) {
						returnData.push({
							json: {
								id: j + 1,
								name: `Item ${j + 1}`,
								value: Math.random() * 100,
								timestamp: new Date().toISOString(),
							},
							pairedItem: { item: i },
						});
					}
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
