declare module "mongodb" {

	export interface WriteError
	{
		/** An integer value identifying the error.*/
		code: number;
		
		/** A description of the error. */
		errmsg: string;
	}

	export interface WriteConcernError
	{
		/** An integer value identifying the write concern error. */
		code: number;
	
		/** A document identifying the write concern setting related to the error. */
		errInfo : any;
	
		/** A description of the error.*/
		errmsg: string;
	}

	/**
	* A wrapper that contains the result status of the mongo shell write methods.
	*/
	export interface WriteResult
	{
		/** The number of documents inserted, excluding upserted documents.See WriteResult.nUpserted for the number of documents inserted through an upsert. */
		nInserted?: number;
		
		/** The number of documents selected for update.If the update operation results in no change to the document, e.g.$set expression updates the value to the current value, nMatched can be greater than nModified. */
		nMatched?: number;

		/**The number of existing documents updated.If the update/ replacement operation results in no change to the document, such as setting the value of the field to its current value, nModified can be less than nMatched. */
		nModified?: number;
		
		/** The number of documents inserted by an upsert.*/
		nUpserted?: number;
		
		/**The _id of the document inserted by an upsert.Returned only if an upsert results in an insert. */
		_id?: ObjectID;
		
		/**The number of documents removed. */
		nRemoved?: number;
		
		/** A document that contains information regarding any error, excluding write concern errors, encountered during the write operation.*/
		writeError?: WriteError;

		/** A document that contains information regarding any write concern errors encountered during the write operation. */
		writeConcernError?: WriteConcernError;
	}
}