# proyecto-agente-rckt
``` Agente IA omnicanal para Elite Beauty (Bogotá). Atiende WhatsApp y llamadas vía Twilio de forma autónoma. Stack: FastAPI + React + Supabase pgvector (RAG) + OpenRouter LLM. Dashboard con métricas, leads CRM y reportes. Deploy en AWS ECS. ```



cd elitebeauty-agent/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

cd elitebeauty-agent/backend/wa_bridge
npm install
npm run dev


cd elitebeauty-agent/frontend
npm install
npm run dev  # http://localhost:3000