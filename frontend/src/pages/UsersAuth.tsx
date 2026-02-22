import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, UserPlus, KeyRound, Trash2 } from 'lucide-react';
import { useAuthStore } from '../store';

type UserRecord = {
    id: number;
    username: string;
    role: 'admin' | 'operator';
    active: number;
    created_at?: string;
    updated_at?: string;
};

export const UsersAuth = () => {
    const { token, user, login } = useAuthStore();
    const [me, setMe] = useState<UserRecord | null>(null);
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('');

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [createUsername, setCreateUsername] = useState('');
    const [createPassword, setCreatePassword] = useState('');
    const [createRole, setCreateRole] = useState<'admin' | 'operator'>('operator');

    const isAdmin = useMemo(() => (me?.role || user?.role) === 'admin', [me?.role, user?.role]);

    const authHeaders = useMemo(
        () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
        [token]
    );

    const loadData = async () => {
        if (!token) return;
        setLoading(true);
        setError('');
        try {
            const meRes = await fetch('/api/users/me', { headers: { Authorization: `Bearer ${token}` } });
            if (!meRes.ok) {
                throw new Error('Failed to fetch user profile');
            }
            const meData: UserRecord = await meRes.json();
            setMe(meData);
            login(token, meData);

            if (meData.role === 'admin') {
                const usersRes = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } });
                if (!usersRes.ok) {
                    throw new Error('Failed to fetch users');
                }
                const usersData: UserRecord[] = await usersRes.json();
                setUsers(usersData);
            } else {
                setUsers([]);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('');
        setError('');

        if (newPassword.length < 8) {
            setError('New password must be at least 8 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('New password and confirmation do not match.');
            return;
        }

        try {
            const res = await fetch('/api/users/change-password', {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ currentPassword, newPassword })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'Failed to change password');
            }
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setStatus('Password updated.');
        } catch (err: any) {
            setError(err.message || 'Failed to change password');
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('');
        setError('');

        if (createPassword.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }

        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    username: createUsername.trim(),
                    password: createPassword,
                    role: createRole
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'Failed to create user');
            }

            setCreateUsername('');
            setCreatePassword('');
            setCreateRole('operator');
            setStatus('User created.');
            await loadData();
        } catch (err: any) {
            setError(err.message || 'Failed to create user');
        }
    };

    const handleRoleOrStatusUpdate = async (target: UserRecord, patch: Partial<UserRecord>) => {
        setStatus('');
        setError('');
        try {
            const res = await fetch(`/api/users/${target.id}`, {
                method: 'PUT',
                headers: authHeaders,
                body: JSON.stringify(patch)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'Failed to update user');
            }
            setStatus(`Updated ${target.username}.`);
            await loadData();
        } catch (err: any) {
            setError(err.message || 'Failed to update user');
        }
    };

    const handleResetPassword = async (target: UserRecord) => {
        const next = window.prompt(`Set new password for ${target.username} (min 8 chars):`);
        if (!next) return;
        if (next.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }

        setStatus('');
        setError('');
        try {
            const res = await fetch(`/api/users/${target.id}`, {
                method: 'PUT',
                headers: authHeaders,
                body: JSON.stringify({ password: next })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'Failed to reset password');
            }
            setStatus(`Password reset for ${target.username}.`);
        } catch (err: any) {
            setError(err.message || 'Failed to reset password');
        }
    };

    const handleDeleteUser = async (target: UserRecord) => {
        const confirmed = window.confirm(`Delete user "${target.username}"?`);
        if (!confirmed) return;

        setStatus('');
        setError('');
        try {
            const res = await fetch(`/api/users/${target.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'Failed to delete user');
            }
            setStatus(`Deleted ${target.username}.`);
            await loadData();
        } catch (err: any) {
            setError(err.message || 'Failed to delete user');
        }
    };

    if (loading) {
        return <div className="text-gray-500 p-6">Loading users and authentication settings...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold text-gray-800">Users & Authentication</h2>
                <p className="text-sm text-gray-500 mt-1">
                    Manage local accounts and secure your own login credentials.
                </p>
            </div>

            {(error || status) && (
                <div className={`${error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'} border rounded-xl px-4 py-3 text-sm`}>
                    {error || status}
                </div>
            )}

            <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-semibold text-gray-800">My Account</h3>
                </div>
                <div className="grid md:grid-cols-3 gap-3 text-sm">
                    <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3">
                        <div className="text-gray-500">Username</div>
                        <div className="font-semibold text-gray-800">{me?.username || user?.username}</div>
                    </div>
                    <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3">
                        <div className="text-gray-500">Role</div>
                        <div className="font-semibold text-gray-800">{me?.role || user?.role}</div>
                    </div>
                    <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3">
                        <div className="text-gray-500">Status</div>
                        <div className="font-semibold text-gray-800">{me?.active === 0 ? 'Disabled' : 'Active'}</div>
                    </div>
                </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <KeyRound className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-semibold text-gray-800">Change Password</h3>
                </div>
                <form onSubmit={handleChangePassword} className="grid md:grid-cols-3 gap-4">
                    <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Current password"
                        className="rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        required
                    />
                    <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="New password (min 8 chars)"
                        className="rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        required
                    />
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className="rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        required
                    />
                    <div className="md:col-span-3">
                        <button
                            type="submit"
                            className="inline-flex items-center gap-2 bg-primary hover:bg-[#00796B] text-white text-sm font-medium rounded-xl px-4 py-2.5 transition-colors"
                        >
                            <KeyRound className="w-4 h-4" />
                            Update Password
                        </button>
                    </div>
                </form>
            </section>

            {isAdmin && (
                <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <UserPlus className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold text-gray-800">Create User</h3>
                    </div>
                    <form onSubmit={handleCreateUser} className="grid md:grid-cols-4 gap-4">
                        <input
                            type="text"
                            value={createUsername}
                            onChange={(e) => setCreateUsername(e.target.value)}
                            placeholder="Username"
                            className="rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            required
                        />
                        <input
                            type="password"
                            value={createPassword}
                            onChange={(e) => setCreatePassword(e.target.value)}
                            placeholder="Password (min 8 chars)"
                            className="rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            required
                        />
                        <select
                            value={createRole}
                            onChange={(e) => setCreateRole(e.target.value as 'admin' | 'operator')}
                            className="rounded-xl border border-gray-300 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                            <option value="operator">Operator</option>
                            <option value="admin">Admin</option>
                        </select>
                        <button
                            type="submit"
                            className="bg-primary hover:bg-[#00796B] text-white text-sm font-medium rounded-xl px-4 py-3 transition-colors"
                        >
                            Create
                        </button>
                    </form>
                </section>
            )}

            {isAdmin && (
                <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">User Directory</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 border-b border-gray-200">
                                    <th className="py-2 pr-4">Username</th>
                                    <th className="py-2 pr-4">Role</th>
                                    <th className="py-2 pr-4">Status</th>
                                    <th className="py-2 pr-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id} className="border-b border-gray-100">
                                        <td className="py-3 pr-4 font-medium text-gray-800">{u.username}</td>
                                        <td className="py-3 pr-4">
                                            <select
                                                value={u.role}
                                                onChange={(e) => handleRoleOrStatusUpdate(u, { role: e.target.value as 'admin' | 'operator' })}
                                                className="rounded-lg border border-gray-300 px-3 py-2 bg-white"
                                            >
                                                <option value="operator">operator</option>
                                                <option value="admin">admin</option>
                                            </select>
                                        </td>
                                        <td className="py-3 pr-4">
                                            <label className="inline-flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={u.active === 1}
                                                    onChange={(e) => handleRoleOrStatusUpdate(u, { active: e.target.checked ? 1 : 0 })}
                                                />
                                                <span>{u.active === 1 ? 'Active' : 'Disabled'}</span>
                                            </label>
                                        </td>
                                        <td className="py-3 pr-4">
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleResetPassword(u)}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-2 hover:bg-gray-50"
                                                >
                                                    <KeyRound className="w-4 h-4" />
                                                    Reset
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteUser(u)}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 text-red-600 px-2.5 py-2 hover:bg-red-50"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </div>
    );
};
