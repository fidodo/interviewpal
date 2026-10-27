export interface LevelDefinition {
  title: string;
  editor: "BLOCKS" | "PYTHON";
  concepts: string[];
  toolbox?: string[];
  challengesToPass?: number;
}

export interface CourseDefinition {
  slug: string;
  title: string;
  subject: string;
  description: string;
  published?: boolean;
  levels: LevelDefinition[];
}
