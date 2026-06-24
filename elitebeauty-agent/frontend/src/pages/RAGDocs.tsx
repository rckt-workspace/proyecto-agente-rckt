import { useEffect, useState } from 'react';
import { getDocs, createDoc, updateDoc, deleteDoc, embedDoc } from '../lib/api';

type Doc = Record<string, any>;

const CATEGORIES = ['procedimientos', 'precios', 'tecnologia', 'faqs', 'horarios', 'general'];
const emptyForm = { title: '', content: '', category: 'general', source: '' };

export default function RAGDocs() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [embedLoading, setEmbedLoading] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = () => getDocs().then(setDocs).catch(() => setDocs([]));
  useEffect(() => { load(); }, []);

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
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este documento?')) return;
    try {
      await deleteDoc(id);
      load();
    } catch {}
  };

  const reEmbed = async (id: string) => {
    setEmbedLoading(id);
    try { await embedDoc(id); load(); }
    catch {}
    finally { setEmbedLoading(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold text-eb-text tracking-wider uppercase">
          Base de conocimiento (RAG)
        </h2>
        <button
          onClick={() => { setForm(emptyForm); setEditing(null); setShowForm(true); }}
          className="btn-primary"
        >
          + Nuevo documento
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="card space-y-4">
          <h3 className="font-semibold text-eb-text">
            {editing ? 'Editar documento' : 'Nuevo documento'}
          </h3>
          <div className="grid grid-cols-2 gap-4">
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
            <button
              onClick={() => { setShowForm(false); setEditing(null); setForm(emptyForm); }}
              className="btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de documentos */}
      <div className="grid grid-cols-1 gap-3">
        {docs.map(doc => (
          <div key={doc.id} className="card">
            <div className="flex items-start justify-between gap-4">
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
              <div className="flex items-center gap-1.5 shrink-0">
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
