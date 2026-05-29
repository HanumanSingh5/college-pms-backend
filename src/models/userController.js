// filepath: c:\Users\hp\Desktop\college-pms\backend-project\src\controllers\userController.js

// Controller functions for user-related operations

const getUsers = (req, res) => {
    res.status(200).json({ message: 'Get all users' });
};

const getUserById = (req, res) => {
    const { id } = req.params;
    res.status(200).json({ message: `Get user with ID: ${id}` });
};

const createUser = (req, res) => {
    const { name, email } = req.body;
    res.status(201).json({ message: 'User created', data: { name, email } });
};

const updateUser = (req, res) => {
    const { id } = req.params;
    const { name, email } = req.body;
    res.status(200).json({ message: `User with ID: ${id} updated`, data: { name, email } });
};

const deleteUser = (req, res) => {
    const { id } = req.params;
    res.status(200).json({ message: `User with ID: ${id} deleted` });
};

module.exports = {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
};