// ============================================================
// HACKFEST — LOCALSTORAGE MOCK & SUPABASE CONFIGURATION
// ============================================================
// 1. Go to https://app.supabase.com → Your Project → Settings → API
// 2. Copy "Project URL" and "anon public" key and paste below
// If you leave these as 'YOUR_PROJECT_ID...', the app will 
// safely fallback to using LocalStorage for offline development!
// ============================================================

const SUPABASE_URL = 'https://izvoyidkvvsexorzudli.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6dm95aWRrdnZzZXhvcnp1ZGxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwNTkwOTUsImV4cCI6MjA5MTYzNTA5NX0.es_whmuEHMkW713330lqzjfLmN0qLh54dvBJxjlCJ6o';

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// UUID Generator for mock
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ------------------------------------------------------------
// LOCAL MOCK SDK implementation
// ------------------------------------------------------------
class MockSupabaseClient {
    constructor() {
        if(!localStorage.getItem('hf_mock_db')) {
            localStorage.setItem('hf_mock_db', JSON.stringify({
                admins: [], teams: [], team_members: [], hackathons: [],
                rounds: [], questions: [], progress: [], submissions: []
            }));
        }
        // Auto-seed admin user if empty
        let authUser = localStorage.getItem('hf_mock_auth_user');
        if(!authUser) {
            localStorage.setItem('hf_mock_auth_user', null);
        }
    }

    get db() {
        return JSON.parse(localStorage.getItem('hf_mock_db'));
    }
    
    saveDb(dbObj) {
        localStorage.setItem('hf_mock_db', JSON.stringify(dbObj));
    }

    get auth() {
        return {
            signUp: async ({ email, password, options }) => {
                const db = this.db;
                if(db.teams.some(t => t.lead_email === email)) return { error: { message: "Email already exists" } };
                const user = { id: uuidv4(), email, user_metadata: options?.data || {} };
                localStorage.setItem('hf_mock_auth_user', JSON.stringify(user));
                return { data: { user }, error: null };
            },
            signInWithPassword: async ({ email, password }) => {
                const db = this.db;
                // Check if admin
                if(db.admins.some(a => a.email === email && a.password === password)) {
                    const user = { id: uuidv4(), email, role: 'admin' };
                    localStorage.setItem('hf_mock_auth_user', JSON.stringify(user));
                    return { data: { user }, error: null };
                }
                // Check if team lead
                if(db.teams.some(t => t.lead_email === email && t.password === password)) {
                    const user = { id: uuidv4(), email, role: 'lead' };
                    localStorage.setItem('hf_mock_auth_user', JSON.stringify(user));
                    return { data: { user }, error: null };
                }
                return { error: { message: "Invalid credentials" } };
            },
            signInWithOAuth: async ({ provider }) => {
                console.log(`Mock sign in with ${provider}`);
                // In mock mode, we just simulate a successful login with a dummy user
                const user = { id: uuidv4(), email: 'mockuser@google.com', user_metadata: { name: 'Mock Google User' } };
                localStorage.setItem('hf_mock_auth_user', JSON.stringify(user));
                window.location.reload();
                return { data: {}, error: null };
            },
            signOut: async () => {
                localStorage.setItem('hf_mock_auth_user', null);
                return { error: null };
            },
            getUser: async () => {
                const u = JSON.parse(localStorage.getItem('hf_mock_auth_user'));
                return { data: { user: u }, error: null };
            }
        }
    }

    from(table) {
        const self = this;
        return {
            select: function(query) {
                // Return query builder
                return new MockQueryBuilder(self, table, query);
            },
            insert: function(rows) {
                return new MockQueryBuilder(self, table, null, 'insert', rows);
            },
            update: function(data) {
                return new MockQueryBuilder(self, table, null, 'update', data);
            },
            delete: function() {
                return new MockQueryBuilder(self, table, null, 'delete');
            }
        }
    }

    async rpc(funcName, params) {
        if(funcName === 'validate_answer') {
            const db = this.db;
            const q = db.questions.find(q => q.round_id === params.p_round_id);
            if(!q) return { error: { message: "Question not found" } };

            let isCorrect = false;
            if(q.case_sensitive) {
                isCorrect = String(params.p_answer).trim() === String(q.answer).trim();
            } else {
                isCorrect = String(params.p_answer).trim().toLowerCase() === String(q.answer).trim().toLowerCase();
            }

            db.submissions.push({
                team_id: params.p_team_id, hackathon_id: params.p_hackathon_id, round_id: params.p_round_id,
                submitted_answer: params.p_answer, is_correct: isCorrect, submitted_at: new Date().toISOString()
            });

            if(isCorrect) {
                let prog = db.progress.find(p => p.team_id === params.p_team_id && p.hackathon_id === params.p_hackathon_id);
                if(prog) {
                    prog.current_round += 1;
                    prog.last_updated = new Date().toISOString();
                }
            }
            this.saveDb(db);
            return { data: isCorrect, error: null };
        }
        return { error: { message: "Unknown RPC" } };
    }

    channel(name) {
        return {
            on: () => this.channel(name),
            subscribe: () => {}
        };
    }
    removeChannel() {}
}

class MockQueryBuilder {
    constructor(client, table, query, action='select', updateData=null) {
        this.client = client;
        this.table = table;
        this.queryStr = query;
        this.action = action;
        this.updateData = updateData;
        this.filters = [];
        this.orderings = [];
    }

    eq(col, val) { this.filters.push({col, val, op: 'eq'}); return this; }
    order(col, options) { this.orderings.push({col, options}); return this; }
    limit(n) { return this; }
    select(query) { this.queryStr = query || '*'; return this; }

    async _execute() {
        let db = this.client.db;
        let records = db[this.table] || [];
        
        // Filter
        this.filters.forEach(f => {
            records = records.filter(r => String(r[f.col]) === String(f.val));
        });

        if(this.action === 'select') {
            // Sort
            this.orderings.forEach(ord => {
                records.sort((a,b) => {
                    const asc = ord.options?.ascending !== false ? 1 : -1;
                    if(a[ord.col] < b[ord.col]) return -1 * asc;
                    if(a[ord.col] > b[ord.col]) return 1 * asc;
                    return 0;
                });
            });

            // "Join" Mocks
            if(this.queryStr && this.queryStr.includes('team_members')) {
                records = records.map(r => ({...r, team_members: db.team_members.filter(tm => tm.team_id === r.id)}));
                // also mock count
                if(this.queryStr.includes('count')) {
                    records.forEach(r => r.team_members = [{count: db.team_members.filter(tm => tm.team_id === r.id).length}]);
                }
            }
            if(this.queryStr && this.queryStr.includes('rounds') && this.table === 'hackathons') {
                records = records.map(r => ({...r, rounds: [{count: db.rounds.filter(rnd => rnd.hackathon_id === r.id).length}]}));
            }
            if(this.queryStr && this.queryStr.includes('teams(')) {
                records = records.map(r => ({...r, teams: db.teams.find(t => t.id === r.team_id) || {team_name: 'Unknown'}}));
            }
            if(this.queryStr && this.queryStr.includes('questions')) {
                records = records.map(r => ({...r, questions: db.questions.filter(q => q.round_id === r.id)}));
            }

            return { data: records, error: null };
        } 
        else if (this.action === 'update') {
            const idsToUpdate = records.map(r => r.id);
            db[this.table] = db[this.table].map(r => {
                if(idsToUpdate.includes(r.id)) return { ...r, ...this.updateData };
                return r;
            });
            this.client.saveDb(db);
            return { data: null, error: null };
        }
        else if (this.action === 'delete') {
            const idsToDelete = records.map(r => r.id);
            db[this.table] = db[this.table].filter(r => !idsToDelete.includes(r.id));
            this.client.saveDb(db);
            return { data: this.queryStr ? records.filter(r => idsToDelete.includes(r.id)) : null, error: null };
        }
        else if (this.action === 'insert') {
            let inserted = [];
            let rows = this.updateData; 
            if(!Array.isArray(rows)) rows = [rows];
            rows.forEach(r => {
                // If it's teams and already exists, we throw error
                if (this.table === 'teams' && db.teams.some(t => t.team_name === r.team_name)) {
                    throw new Error("Duplicate team name");
                }
                const newRow = { ...r, id: uuidv4(), created_at: new Date().toISOString() };
                if(this.table === 'teams' && r.password_hash === 'managed_by_auth') {
                    const passInput = document.getElementById('teamPassword');
                    newRow.password = passInput ? passInput.value : 'mockpassword';
                }
                db[this.table].push(newRow);
                inserted.push(newRow);
            });
            this.client.saveDb(db);
            return { data: this.queryStr ? inserted : null, error: null };
        }
    }

    async single() {
        const { data, error } = await this._execute();
        if(data && data.length > 0) return { data: data[0], error: null };
        return { data: null, error: { message: "No row found" } };
    }

    then(resolve, reject) {
        this._execute().then(resolve).catch(reject);
    }
}

// Check if actual credentials provided. If not, use mock.
const isLiveSupabase = SUPABASE_URL.includes('supabase.co') && !SUPABASE_URL.includes('YOUR_PROJECT_ID');
export const supabase = isLiveSupabase ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : new MockSupabaseClient();

// If we are booting up and using Mock, let's inject a default admin if none exists so users can play around.
if(!isLiveSupabase) {
    const mockClient = supabase;
    let db = mockClient.db;
    if(db.admins.length === 0) {
        db.admins.push({ id: uuidv4(), email: 'admin@hackfest.local', password: 'password', role: 'admin' });
        mockClient.saveDb(db);
        console.warn("MOCK DATABASE INITIALIZED. Default admin created: email='admin@hackfest.local', password='password'");
    }
}

// ============================================================
// AUTH HELPERS
// ============================================================

export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export async function getCurrentTeam(user) {
    if (!user) return null;
    const { data, error } = await supabase
        .from('teams')
        .select('*, team_members(*)')
        .eq('lead_email', user.email)
        .single();
    if (error) return null;
    return data;
}

export async function isAdmin(user) {
    if (!user) return false;
    const { data } = await supabase
        .from('admins')
        .select('id')
        .eq('email', user.email)
        .single();
    return !!data;
}

export async function requireAuth(redirectTo = 'index.html') {
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = redirectTo;
        return null;
    }
    return user;
}

export async function redirectIfAuth() {
    const user = await getCurrentUser();
    if (user) {
        const admin = await isAdmin(user);
        window.location.href = admin ? 'admin.html' : 'dashboard.html';
    }
}

export async function signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + window.location.pathname,
            queryParams: {
                access_type: 'offline',
                prompt: 'consent',
            },
        },
    });
    return { data, error };
}

// ============================================================
// DATE / TIME HELPERS
// ============================================================

export function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    });
}

export function formatDuration(startIso, endIso) {
    if (!startIso || !endIso) return '—';
    const ms = new Date(endIso) - new Date(startIso);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export function hackathonStatus(hackathon) {
    const now = new Date();
    const start = new Date(hackathon.start_time);
    const end = new Date(hackathon.end_time);
    if (now < start) return 'upcoming';
    if (now > end) return 'closed';
    return 'ongoing';
}
