import path from 'node:path';
import { existsSync } from 'node:fs';

// src/config e dist/config têm a mesma profundidade: independe do cwd.
export const projectRoot = path.resolve(__dirname, '../../..');
export const backendRoot = path.join(projectRoot, 'backend');
export function resolveSurveyRoot(configured = process.env.SURVEY_ROOT): string {
  if (!configured?.trim()) return path.join(projectRoot, 'skills');
  const root = path.resolve(backendRoot, configured.trim());
  // Compatibilidade com .env anterior que apontava para a raiz do projeto.
  if (!existsSync(path.join(root, 'focus')) && existsSync(path.join(root, 'skills', 'focus'))) {
    return path.join(root, 'skills');
  }
  return root;
}
