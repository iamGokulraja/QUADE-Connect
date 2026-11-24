
import { useState, useRef } from "react";
import { supabase } from "../../lib/supabaseClient";

function Documents() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const fileInputRef = useRef(null);

  // Select multiple individual files
  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files || []);

    setSelectedFiles(files);

    setMessage(
      files.length > 0
        ? `${files.length} files selected`
        : "No files selected."
    );

    console.log("Selected files:", files);
  };

  // Upload files to FastAPI
  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setMessage("Please select files first.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) throw error;

      const accessToken = data.session?.access_token;

      if (!accessToken) {
        throw new Error("Please log in again.");
      }

      const formData = new FormData();

      selectedFiles.forEach((file) => {
        formData.append("files", file);
        formData.append("relative_paths", file.name);
      });

      const response = await fetch(
        "http://127.0.0.1:8000/api/documents/upload",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Upload failed.");
      }

      setMessage(
        `${result.total_uploaded} files uploaded successfully.`
      );

      setSelectedFiles([]);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

    } catch (error) {
      console.error("Upload error:", error);
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="p-6">

        <h1 className="text-2xl font-bold mb-2">
          Documents
        </h1>

        <p className="text-gray-500 mb-6">
          Upload PDF, images, Excel, Word and other files.
        </p>

        <div className="border border-slate-300 rounded-lg p-8">

          {/* Select Files */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx,.csv,.txt"
            onChange={handleFileSelect}
            className="block"
          />

          {/* Selected Files */}
          {selectedFiles.length > 0 && (
            <div className="mt-5">

              <p className="font-semibold text-green-700">
                {selectedFiles.length} files selected
              </p>

              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                {selectedFiles.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    {file.name} — {(file.size / 1024).toFixed(2)} KB
                  </li>
                ))}
              </ul>

            </div>
          )}

          {/* Upload Button */}
          <button
            type="button"
            onClick={handleUpload}
            disabled={loading || selectedFiles.length === 0}
            className="mt-5 px-6 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Uploading..." : "Upload Files"}
          </button>

          {/* Message */}
          {message && (
            <p className="mt-4 text-sm">
              {message}
            </p>
          )}

        </div>
      </div>
    </>
  );
}

export default Documents;
