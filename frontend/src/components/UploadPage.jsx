import { useState } from 'react';

function UploadPage({ onProceed }) {
  const [jdFile, setJdFile] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');

  const handleFileChange = (e, setFile) => {
    const file = e.target.files[0];
    if (file) {
      setFile(file);
    }
  };

  const handleUpload = async () => {
    if (!jdFile || !resumeFile) {
      setUploadStatus('Please upload both files.');
      return;
    }

    setIsProcessing(true);
    const formData = new FormData();
    formData.append('jd', jdFile);
    formData.append('resume', resumeFile);

    try {
    //   setProcessingStage('Uploading files...');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setProcessingStage('Processing Job Description...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        setProcessingStage('Processing Resume...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        setProcessingStage('Preparing Interview Environment...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        setProcessingStage('Interview in progress...');
        onProceed();
      } else {
        setUploadStatus('Failed to process files. Please try again.');
        setIsProcessing(false);
      }
    } catch (error) {
      setUploadStatus('Error processing files. Please try again.');
      setIsProcessing(false);
    }
  };

  // Loading spinner component
  const LoadingSpinner = () => (
    <svg className="animate-spin h-5 w-5 mr-2 inline" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="max-w-4xl w-full px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">AI Interview Assistant</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Upload your Job Description and Resume to begin an AI-powered interview experience tailored to your profile.
          </p>
        </div>

        <div className="bg-white p-8 rounded-xl shadow-lg">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Left Column - Upload Section */}
            <div className="space-y-6">
              <div className="upload-box">
                <label className="block text-gray-700 font-semibold mb-2">
                  Job Description (PDF)
                  <span className="text-sm font-normal text-gray-500 ml-2">Required</span>
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => handleFileChange(e, setJdFile)}
                    className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg focus:outline-none focus:border-primary hover:border-gray-400 transition-colors"
                    disabled={isProcessing}
                  />
                  {jdFile && (
                    <span className="absolute right-2 top-3 text-green-500">
                      ✓
                    </span>
                  )}
                </div>
              </div>

              <div className="upload-box">
                <label className="block text-gray-700 font-semibold mb-2">
                  Resume (PDF)
                  <span className="text-sm font-normal text-gray-500 ml-2">Required</span>
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => handleFileChange(e, setResumeFile)}
                    className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg focus:outline-none focus:border-primary hover:border-gray-400 transition-colors"
                    disabled={isProcessing}
                  />
                  {resumeFile && (
                    <span className="absolute right-2 top-3 text-green-500">
                      ✓
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={handleUpload}
                disabled={isProcessing || !jdFile || !resumeFile}
                className={`w-full py-3 rounded-lg text-white font-semibold transition-all duration-300 ${
                  isProcessing || !jdFile || !resumeFile
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-primary hover:bg-primary-dark'
                }`}
              >
                {isProcessing ? (
                  <span>
                    <LoadingSpinner />
                    {processingStage}
                  </span>
                ) : (
                  'Proceed with Interview'
                )}
              </button>
            </div>

            {/* Right Column - Information */}
            <div className="bg-gray-50 p-6 rounded-lg space-y-4">
              <h3 className="text-lg font-semibold text-gray-800">How it works</h3>
              <ol className="list-decimal list-inside space-y-3 text-gray-600">
                <li>Upload your Job Description (PDF)</li>
                <li>Upload your Resume (PDF)</li>
                <li>Our AI processes both documents</li>
                <li>Begin your personalized interview experience</li>
              </ol>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="font-semibold text-gray-800 mb-2">Features</h4>
                <ul className="space-y-2 text-gray-600">
                  <li className="flex items-center">
                    <span className="text-green-500 mr-2">✓</span>
                    Personalized questions based on your profile
                  </li>
                  <li className="flex items-center">
                    <span className="text-green-500 mr-2">✓</span>
                    Real-time voice interaction
                  </li>
                  <li className="flex items-center">
                    <span className="text-green-500 mr-2">✓</span>
                    Detailed feedback and evaluation
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Show error messages only */}
          {uploadStatus && uploadStatus.includes('Error') && (
            <div className="mt-4 p-3 rounded-lg text-center bg-red-100 text-red-700">
              {uploadStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UploadPage;
