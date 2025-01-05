import { useState } from 'react';
import UploadPage from './components/UploadPage';
import InterviewAssistant from './components/InterviewAssistant';

function App() {
  const [isUploaded, setIsUploaded] = useState(false);

  const handleProceed = () => {
    setIsUploaded(true);
  };

  return (
    <div>
      {isUploaded ? <InterviewAssistant /> : <UploadPage onProceed={handleProceed} />}
    </div>
  );
}

export default App;
