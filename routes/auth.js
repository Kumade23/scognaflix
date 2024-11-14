const express = require('express');
const router = express.Router();
const User = require('../models/User');

// GET: Pagina di login
router.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// POST: Autenticazione utente
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (user && await user.comparePassword(password)) {
        req.session.user = { id: user._id, isAdmin: user.isAdmin };
        return res.redirect(user.isAdmin ? '/admin' : '/'); // Reindirizza a /
    } else {
        return res.render('login', { error: 'Username o Password errati' });
    }
});

// GET: Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

module.exports = router;
