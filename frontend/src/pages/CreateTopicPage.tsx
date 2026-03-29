import React from 'react'
import { TopicCreator } from '../components/TopicCreator'
import { useNavigate } from 'react-router-dom'

export const CreateTopicPage: React.FC = () => {
  const navigate = useNavigate()

  const handleTopicCreated = (topicId: string) => {
    navigate(`/topic/${topicId}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <TopicCreator onTopicCreated={handleTopicCreated} />
    </div>
  )
}

export default CreateTopicPage
