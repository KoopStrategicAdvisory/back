const express = require('express');
const axios = require('axios');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Configuración de Spotify API
const SPOTIFY_CONFIG = {
  clientId: process.env.SPOTIFY_CLIENT_ID || '074997d1db5a42ef91dd9091da00de43',
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '5ebb1adb852d45039357283a5b54bf8a',
  redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'https://www.koopstrategicadvisory.com/callback'
};

// Middleware para verificar autenticación
const requireAuth = authenticate;


// Intercambiar código de autorización por token de acceso
router.post('/auth/token', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    
    console.log('🔑 Intercambiando código por token:', { code: code?.substring(0, 10) + '...', redirectUri: SPOTIFY_CONFIG.redirectUri });
    
    if (!code) {
      return res.status(400).json({ error: 'Código de autorización requerido' });
    }

    const response = await axios.post('https://accounts.spotify.com/api/token', 
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: SPOTIFY_CONFIG.redirectUri
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CONFIG.clientId}:${SPOTIFY_CONFIG.clientSecret}`).toString('base64')}`
        }
      }
    );

    const { access_token, refresh_token, expires_in, token_type } = response.data;

    // Guardar tokens en la sesión del usuario (en producción usar base de datos)
    if (!req.session) {
      req.session = {};
    }
    req.session.spotifyTokens = {
      access_token,
      refresh_token,
      expires_in,
      token_type,
      expires_at: Date.now() + (expires_in * 1000)
    };

    res.json({
      access_token,
      refresh_token,
      expires_in,
      token_type
    });

  } catch (error) {
    console.error('Error exchanging code for token:', error.response?.data || error.message);
    res.status(400).json({ 
      error: 'Error al intercambiar código por token',
      details: error.response?.data || error.message
    });
  }
});

// Refrescar token de acceso
router.post('/auth/refresh', requireAuth, async (req, res) => {
  try {
    const { refresh_token } = req.body;
    
    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token requerido' });
    }

    const response = await axios.post('https://accounts.spotify.com/api/token', 
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh_token
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CONFIG.clientId}:${SPOTIFY_CONFIG.clientSecret}`).toString('base64')}`
        }
      }
    );

    const { access_token, expires_in, token_type } = response.data;

    // Actualizar tokens en la sesión
    if (req.session.spotifyTokens) {
      req.session.spotifyTokens.access_token = access_token;
      req.session.spotifyTokens.expires_in = expires_in;
      req.session.spotifyTokens.expires_at = Date.now() + (expires_in * 1000);
    }

    res.json({
      access_token,
      expires_in,
      token_type
    });

  } catch (error) {
    console.error('Error refreshing token:', error.response?.data || error.message);
    res.status(400).json({ 
      error: 'Error al refrescar token',
      details: error.response?.data || error.message
    });
  }
});

// Obtener perfil del usuario de Spotify
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { access_token } = req.session?.spotifyTokens || {};
    
    if (!access_token) {
      return res.status(401).json({ error: 'No hay token de acceso de Spotify' });
    }

    const response = await axios.get('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    res.json(response.data);

  } catch (error) {
    console.error('Error fetching user profile:', error.response?.data || error.message);
    res.status(400).json({ 
      error: 'Error al obtener perfil del usuario',
      details: error.response?.data || error.message
    });
  }
});

// Obtener playlists del usuario
router.get('/playlists', requireAuth, async (req, res) => {
  try {
    const { access_token } = req.session.spotifyTokens || {};
    
    if (!access_token) {
      return res.status(401).json({ error: 'No hay token de acceso de Spotify' });
    }

    const response = await axios.get('https://api.spotify.com/v1/me/playlists', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    res.json(response.data);

  } catch (error) {
    console.error('Error fetching playlists:', error.response?.data || error.message);
    res.status(400).json({ 
      error: 'Error al obtener playlists',
      details: error.response?.data || error.message
    });
  }
});

// Obtener tracks de una playlist
router.get('/playlists/:playlistId/tracks', requireAuth, async (req, res) => {
  try {
    const { access_token } = req.session.spotifyTokens || {};
    const { playlistId } = req.params;
    
    if (!access_token) {
      return res.status(401).json({ error: 'No hay token de acceso de Spotify' });
    }

    const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    res.json(response.data);

  } catch (error) {
    console.error('Error fetching playlist tracks:', error.response?.data || error.message);
    res.status(400).json({ 
      error: 'Error al obtener tracks de la playlist',
      details: error.response?.data || error.message
    });
  }
});

// Obtener estado de reproducción actual
router.get('/player', requireAuth, async (req, res) => {
  try {
    const { access_token } = req.session.spotifyTokens || {};
    
    if (!access_token) {
      return res.status(401).json({ error: 'No hay token de acceso de Spotify' });
    }

    const response = await axios.get('https://api.spotify.com/v1/me/player', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    res.json(response.data);

  } catch (error) {
    console.error('Error fetching playback state:', error.response?.data || error.message);
    res.status(400).json({ 
      error: 'Error al obtener estado de reproducción',
      details: error.response?.data || error.message
    });
  }
});

// Controlar reproducción
router.put('/player/:action', requireAuth, async (req, res) => {
  try {
    const { access_token } = req.session.spotifyTokens || {};
    const { action } = req.params;
    
    if (!access_token) {
      return res.status(401).json({ error: 'No hay token de acceso de Spotify' });
    }

    const validActions = ['play', 'pause', 'next', 'previous'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: 'Acción no válida' });
    }

    const method = ['play', 'pause'].includes(action) ? 'PUT' : 'POST';
    const url = `https://api.spotify.com/v1/me/player/${action}`;

    const response = await axios({
      method,
      url,
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    res.json({ success: true });

  } catch (error) {
    console.error(`Error ${req.params.action} playback:`, error.response?.data || error.message);
    res.status(400).json({ 
      error: `Error al ${req.params.action} reproducción`,
      details: error.response?.data || error.message
    });
  }
});

// Obtener URL de autorización
router.get('/auth/url', requireAuth, (req, res) => {
  const scopes = [
    'user-read-private',
    'user-read-email',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-library-read',
    'user-top-read'
  ].join(' ');

  const authUrl = `https://accounts.spotify.com/authorize?` +
    `client_id=${SPOTIFY_CONFIG.clientId}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(SPOTIFY_CONFIG.redirectUri)}&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `show_dialog=true`;

  res.json({ authUrl });
});

// Cerrar sesión de Spotify
router.post('/logout', requireAuth, (req, res) => {
  try {
    // Limpiar tokens de la sesión
    if (req.session.spotifyTokens) {
      delete req.session.spotifyTokens;
    }
    
    res.json({ message: 'Sesión de Spotify cerrada correctamente' });
  } catch (error) {
    console.error('Error cerrando sesión de Spotify:', error);
    res.status(500).json({ 
      error: 'Error al cerrar sesión de Spotify',
      details: error.message
    });
  }
});

module.exports = router;
