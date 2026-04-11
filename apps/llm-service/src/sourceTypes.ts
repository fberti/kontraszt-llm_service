export type SourceHeadlineDefinition = {
  _id: string;
  _creationTime: number;
  hashedId: string;
  headlineText: string;
  href: string;
  siteName?: string | null;
};

export type LlmInputHeadline = {
  hashedId: string;
  headlineText: string;
};

export type SourceHeadlineDefinitionsPage = {
  page: SourceHeadlineDefinition[];
  isDone: boolean;
  continueCursor: string;
};
