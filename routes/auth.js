const express = require('express');
const router = express.Router();
const User = require('../models/User');

// GET: Pagina di login
router.get('/login', (req, res) => {
    res.render('login');
});

// POST: Autenticazione utente
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (user && await user.comparePassword(password)) {
        req.session.user = { id: user._id, isAdmin: user.isAdmin };
        return res.redirect(user.isAdmin ? '/admin' : '/'); // Reindirizza a /
    } else {
        res.send('Credenziali non valide');
    }
});

// GET: Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

module.exports = router;
