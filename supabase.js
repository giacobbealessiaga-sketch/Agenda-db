const SUPABASE_URL = 'https://grmfbbqujopstaagknuc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_S5LYjuFe5m4ieS6BNZXz5A_-E7kuxuK';

// Minimal Supabase client (no npm needed)
const sb = {
  headers: {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY
  },

  async signUp(email, password) {
    const r = await fetch(SUPABASE_URL + '/auth/v1/signup', {
      method: 'POST', headers: this.headers,
      body: JSON.stringify({ email, password })
    });
    return r.json();
  },

  async signIn(email, password) {
    const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: this.headers,
      body: JSON.stringify({ email, password })
    });
    return r.json();
  },

  async signOut(token) {
    await fetch(SUPABASE_URL + '/auth/v1/logout', {
      method: 'POST',
      headers: { ...this.headers, 'Authorization': 'Bearer ' + token }
    });
  },

  async getUser(token) {
    const r = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { ...this.headers, 'Authorization': 'Bearer ' + token }
    });
    return r.json();
  },

  authHeaders(token) {
    return { ...this.headers, 'Authorization': 'Bearer ' + token };
  },

  // Upsert atomico di un giorno: una sola richiesta, niente DELETE separata,
  // così il dato non può restare cancellato se qualcosa va storto a metà.
  // Richiede un vincolo UNIQUE su (user_id, day_key) lato Supabase.
  async upsertDay(token, userId, dayKey, content) {
    const r = await fetch(SUPABASE_URL + '/rest/v1/agenda?on_conflict=user_id,day_key', {
      method: 'POST',
      headers: {
        ...this.authHeaders(token),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({ user_id: userId, day_key: dayKey, content, updated_at: new Date().toISOString() })
    });
    return r.ok;
  },

  // Delete a day
  async deleteDay(token, userId, dayKey) {
    const r = await fetch(SUPABASE_URL + '/rest/v1/agenda?user_id=eq.' + userId + '&day_key=eq.' + dayKey, {
      method: 'DELETE', headers: this.authHeaders(token)
    });
    return r.ok;
  },

  // Get all agenda days for user
  async getAllDays(token, userId) {
    const r = await fetch(SUPABASE_URL + '/rest/v1/agenda?user_id=eq.' + userId + '&select=day_key,content', {
      headers: this.authHeaders(token)
    });
    return r.json();
  }
};
