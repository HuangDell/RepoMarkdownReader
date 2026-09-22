import { jsonError, jsonOk } from '@/lib/server/http';
import { uploadMarkdownFiles } from '@/lib/server/repositories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const maxFileSize = 10 * 1024 * 1024;

export async function POST(request: Request, context: { params: Promise<{ repoId: string }> }) {
  try {
    const { repoId } = await context.params;
    const formData = await request.formData();
    const folder = formData.get('folder');
    const fileEntries = formData.getAll('files');

    if (typeof folder !== 'string') return jsonError('folder is required.');

    const files: Array<{ name: string; content: string }> = [];
    const decoder = new TextDecoder('utf-8', { fatal: true });

    for (const entry of fileEntries) {
      if (!(entry instanceof File)) return jsonError('Only files can be uploaded.');
      if (entry.size > maxFileSize) return jsonError(`File ${entry.name} exceeds the 10 MB limit.`);

      let content: string;
      try {
        content = decoder.decode(await entry.arrayBuffer());
      } catch {
        return jsonError(`File ${entry.name} is not valid UTF-8 text.`);
      }

      files.push({ name: entry.name, content });
    }

    const paths = await uploadMarkdownFiles(repoId, folder, files);
    return jsonOk({ files: paths }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.name === 'ConflictError' ? 409 : 400;
    return jsonError(error instanceof Error ? error.message : 'Failed to upload files.', status);
  }
}
