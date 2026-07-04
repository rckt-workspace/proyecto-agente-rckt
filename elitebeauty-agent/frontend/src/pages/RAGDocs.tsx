import { useEffect, useRef, useState } from 'react';
import { getDocs, createDoc, updateDoc, deleteDoc, embedDoc, uploadDoc } from '../lib/api';

type Doc = Record<string, any>;
type FormMode = 'text' | 'file';

const CATEGORIES = ['procedimientos', 'precios', 'tecnologia', 'faqs', 'horarios', 'general'];
const ACCEPTED = '.pdf,.docx,.doc,.txt,.md,.json,.xml';
const emptyForm = { title: '', content: '', category: 'general', source: '' };
const emptyUpload = { title: '', category: 'general', source: 'archivo' };

export default function RAGDocs() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [embedLoading, setEmbedLoading] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('text');

  // file upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMeta, setUploadMeta] = useState(emptyUpload);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => getDocs().then(setDocs).catch(() => setDocs([]));
  useEffect(() => { load(); }, []);

  // ── Text form ───────────────────────────────────────────────────────────────
  const save = async () => {
    setLoading(true);
    try {
      if (editing) {
        await updateDoc(editing, form);
      } else {
        await createDoc(form);
      }
      setForm(emptyForm);
      setEditing(null);
      setShowForm(false);
      load();
    } catch {
    } finally { setLoading(false); }
  };

  const startEdit = (doc: Doc) => {
    setForm({ title: doc.title, content: doc.content, category: doc.category || 'general', source: doc.source || '' });
    setEditing(doc.id);
    setFormMode('text');
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este documento?')) return;
    try { await deleteDoc(id); load(); } catch {}
  };

  const reEmbed = async (id: string) => {
    setEmbedLoading(id);
    try { await embedDoc(id); load(); }
    catch {}
    finally { setEmbedLoading(null); }
  };

  // ── File upload ─────────────────────────────────────────────────────────────
  const handleFileSelect = (file: File) => {
    setUploadFile(file);
    setUploadError('');
    const stem = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    const title = stem.charAt(0).toUpperCase() + stem.slice(1);
    setUploadMeta(m => ({ ...m, title }));
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const submitUpload = async () => {
    if (!uploadFile) return;
    setUploadLoading(true);
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('title', uploadMeta.title);
      fd.append('category', uploadMeta.category);
      fd.append('source', uploadMeta.source);
      await uploadDoc(fd);
      setUploadFile(null);
      setUploadMeta(emptyUpload);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowForm(false);
      load();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Error al subir el archivo';
      setUploadError(msg);
    } finally { setUploadLoading(false); }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
    setUploadFile(null);
    setUploadMeta(emptyUpload);
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-display font-bold text-eb-text tracking-wider uppercase">
          Base de conocimiento (RAG)
        </h2>
        <button
          onClick={() => { setForm(emptyForm); setEditing(null); setFormMode('text'); setShowForm(true); }}
          className="btn-primary"
        >
          + Nuevo documento
        </button>
      </div>

      {/* ── Formulario ── */}
      {showForm && (
        <div className="card space-y-4">

          {/* Tabs (solo al crear, no al editar) */}
          {!editing && (
            <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
              {(['text', 'file'] as FormMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => { setFormMode(mode); setUploadError(''); }}
                  className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all"
                  style={formMode === mode
                    ? { background: 'rgba(192,132,252,0.15)', color: '#c084fc', border: '1px solid rgba(192,132,252,0.3)' }
                    : { color: '#6b7280', border: '1px solid transparent' }
                  }
                >
                  {mode === 'text' ? '✏️ Texto manual' : '📎 Subir archivo'}
                </button>
              ))}
            </div>
          )}

          {editing && (
            <h3 className="font-semibold text-eb-text">Editar documento</h3>
          )}

          {/* ── Modo texto ── */}
          {(formMode === 'text' || editing) && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-eb-muted block mb-1">Título</label>
                  <input
                    type="text"
                    className="eb-input"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Ej: Procedimiento Tensamax"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-eb-muted block mb-1">Categoría</label>
                  <select
                    className="eb-select"
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-eb-muted block mb-1">Contenido</label>
                <textarea
                  rows={6}
                  className="eb-input"
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="Escribe aquí la información que el agente debe conocer..."
                />
              </div>
              <div>
                <label className="text-xs font-medium text-eb-muted block mb-1">Fuente</label>
                <input
                  type="text"
                  className="eb-input"
                  value={form.source}
                  onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                  placeholder="Ej: staff, web, manual"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={save}
                  disabled={loading || !form.title || !form.content}
                  className="btn-primary"
                >
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
                <button onClick={cancelForm} className="btn-secondary">Cancelar</button>
              </div>
            </>
          )}

          {/* ── Modo archivo ── */}
          {formMode === 'file' && !editing && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-10 gap-3 transition-all"
                style={{
                  borderColor: dragOver ? '#c084fc' : 'rgba(255,255,255,0.12)',
                  background: dragOver ? 'rgba(192,132,252,0.06)' : 'rgba(255,255,255,0.02)',
                }}
              >
                {uploadFile ? (
                  <>
                    <span className="text-3xl">✅</span>
                    <p className="text-sm font-medium text-eb-text">{uploadFile.name}</p>
                    <p className="text-xs text-eb-dim">
                      {(uploadFile.size / 1024).toFixed(1)} KB · Haz clic para cambiar
                    </p>
                  </>
                ) : (
                  <>
                    <span className="text-3xl">📄</span>
                    <p className="text-sm font-medium text-eb-text">
                      Arrastra un archivo o haz clic para seleccionar
                    </p>
                    <p className="text-xs text-eb-dim">PDF · Word · TXT · Markdown · JSON · XML</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED}
                  className="hidden"
                  onChange={onFileInput}
                />
              </div>

              {/* Metadatos del archivo */}
              {uploadFile && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-eb-muted block mb-1">Título</label>
                      <input
                        type="text"
                        className="eb-input"
                        value={uploadMeta.title}
                        onChange={e => setUploadMeta(m => ({ ...m, title: e.target.value }))}
                        placeholder="Nombre del documento"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-eb-muted block mb-1">Categoría</label>
                      <select
                        className="eb-select"
                        value={uploadMeta.category}
                        onChange={e => setUploadMeta(m => ({ ...m, category: e.target.value }))}
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-eb-muted block mb-1">Fuente</label>
                    <input
                      type="text"
                      className="eb-input"
                      value={uploadMeta.source}
                      onChange={e => setUploadMeta(m => ({ ...m, source: e.target.value }))}
                      placeholder="Ej: archivo, staff, web"
                    />
                  </div>
                </div>
              )}

              {uploadError && (
                <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{uploadError}</p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={submitUpload}
                  disabled={uploadLoading || !uploadFile}
                  className="btn-primary"
                >
                  {uploadLoading ? 'Procesando...' : 'Subir y guardar'}
                </button>
                <button onClick={cancelForm} className="btn-secondary">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Lista de documentos ── */}
      <div className="grid grid-cols-1 gap-3">
        {docs.map(doc => (
          <div key={doc.id} className="card">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h4 className="font-semibold text-eb-text text-sm">{doc.title}</h4>
                  <span
                    className="badge text-eb-dim text-xs"
                    style={{ background: 'rgba(255,255,255,0.05)' }}
                  >
                    {doc.category}
                  </span>
                  <span
                    className={`badge text-xs ${
                      doc.embedded
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-yellow-500/10 text-yellow-400'
                    }`}
                  >
                    {doc.embedded ? '✓ Embebido' : '⏳ Pendiente'}
                  </span>
                </div>
                <p className="text-xs text-eb-dim line-clamp-2">{doc.content}</p>
                {doc.source && <p className="text-xs text-eb-dim mt-1">Fuente: {doc.source}</p>}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                <button
                  onClick={() => reEmbed(doc.id)}
                  disabled={embedLoading === doc.id}
                  className="text-xs font-medium px-2 py-1 rounded-lg transition-all"
                  style={{ color: '#c084fc', border: '1px solid rgba(192,132,252,0.25)', background: 'rgba(147,51,234,0.08)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(147,51,234,0.15)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(147,51,234,0.08)')}
                >
                  {embedLoading === doc.id ? '...' : '🔁 Embeber'}
                </button>
                <button
                  onClick={() => startEdit(doc)}
                  className="text-xs font-medium px-2 py-1 rounded-lg transition-all"
                  style={{ color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)', background: 'rgba(56,189,248,0.08)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(56,189,248,0.15)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(56,189,248,0.08)')}
                >
                  Editar
                </button>
                <button
                  onClick={() => remove(doc.id)}
                  className="text-xs font-medium px-2 py-1 rounded-lg transition-all"
                  style={{ color: '#f87171', border: '1px solid rgba(248,113,113,0.25)', background: 'rgba(239,68,68,0.08)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        ))}
        {docs.length === 0 && (
          <div className="text-center py-12 text-eb-dim text-sm">
            Sin documentos. Crea el primero para entrenar al agente.
          </div>
        )}
      </div>
    </div>
  );
}
