import ts from 'typescript';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=await readFile(path.join(root,'src','tracking','hand.worker.ts'),'utf8');
// A classic worker is required: MediaPipe's Emscripten loader registers its
// ModuleFactory through importScripts, which does not work in module workers.
const result=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,removeComments:true}});
await mkdir(path.join(root,'public'),{recursive:true});
await writeFile(path.join(root,'public','hand-worker.js'),result.outputText);
