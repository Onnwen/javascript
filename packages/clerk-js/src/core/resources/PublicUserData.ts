import type { PublicUserData as IPublicUserData, PublicUserDataJSON } from '@clerk/types';

export class PublicUserData implements IPublicUserData {
  firstName!: string | null;
  lastName!: string | null;
  imageUrl!: string;
  hasImage!: boolean;
  identifier!: string;
  userId?: string;

  constructor(data: PublicUserDataJSON) {
    this.fromJSON(data);
  }

  protected fromJSON(data: PublicUserDataJSON | null): this {
    if (data) {
      this.firstName = data.first_name;
      this.lastName = data.last_name;
      this.imageUrl = data.image_url;
      this.hasImage = data.has_image;
      this.identifier = data.identifier;
      this.userId = data.user_id;
    }

    return this;
  }

  public toJSON(): PublicUserDataJSON {
    return {
      object: 'public_user_data',
      id: this.userId || '',
      first_name: this.firstName,
      last_name: this.lastName,
      image_url: this.imageUrl,
      has_image: this.hasImage,
      identifier: this.identifier,
      user_id: this.userId,
    };
  }
}
