import { useState } from "react";

const RegisterView = ({ onBack, onSuccess }) => {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    role: "client",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        onSuccess("Account created! Please log in.");
      } else {
        setError(
          data.detail || "Registration failed. Try a different username.",
        );
      }
    } catch (err) {
      setError("Server unreachable. Is Docker running?");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f5f2] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-[3rem] shadow-2xl border border-white/20 overflow-hidden">
        <div className="bg-[#e8ddd0] p-10 text-center">
          <h2 className="text-xl font-black text-[#5d5045] uppercase tracking-[0.3em]">
            Join BeautyTask
          </h2>
          <p className="text-[10px] text-[#a39485] font-bold uppercase mt-2">
            Create your account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-5">
          {/* Full Name / Username */}
          <div className="space-y-1">
            <input
              type="text"
              placeholder="USERNAME"
              required
              className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl outline-none focus:border-[#5d5045] transition-all text-xs"
              onChange={(e) =>
                setFormData({ ...formData, username: e.target.value })
              }
            />
          </div>

          {/* Email */}
          <div className="space-y-1">
            <input
              type="email"
              placeholder="EMAIL ADDRESS"
              required
              className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl outline-none focus:border-[#5d5045] transition-all text-xs"
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
            />
          </div>

          {/* Password */}
          <div className="space-y-1">
            <input
              type="password"
              placeholder="PASSWORD"
              required
              className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl outline-none focus:border-[#5d5045] transition-all text-xs"
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
            />
          </div>

          {error && (
            <p className="text-red-400 text-[9px] font-black text-center uppercase tracking-tighter">
              {error}
            </p>
          )}

          <div className="pt-4 space-y-4">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-5 bg-[#5d5045] text-white rounded-2xl font-bold uppercase text-[10px] tracking-[0.3em] hover:bg-[#4a3f35] transition-all disabled:opacity-50"
            >
              {isLoading ? "Creating..." : "Register Now"}
            </button>

            <button
              type="button"
              onClick={onBack}
              className="w-full text-[9px] font-black text-[#a39485] uppercase tracking-widest hover:text-[#5d5045] transition-all"
            >
              Already have an account? Login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegisterView;
